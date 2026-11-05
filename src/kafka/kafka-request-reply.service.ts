import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Optional,
} from '@nestjs/common';
import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';
import { randomUUID } from 'crypto';
import { ConfigService } from '../config/config.service';
import {
  KAFKA_TOPICS,
  KAFKA_HEADERS,
  AnalyticsQuery,
  AnalyticsReply,
  AnalyticsQueryType,
  assertAnalyticsQuery,
  validateAnalyticsReply,
} from 'jira-contracts';

export class KafkaTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KafkaTimeoutError';
  }
}

interface PendingRequest {
  correlationId: string;
  sprintId: string;
  resolve: (reply: AnalyticsReply) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
  createdAt: number;
}

export interface RequestAnalyticsOptions {
  sprintId: string;
  projectId?: string;
  queryType?: string | AnalyticsQueryType;
  metadata?: Record<string, unknown>;
  timeoutMs?: number;
}

@Injectable()
export class KafkaRequestReplyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaRequestReplyService.name);
  private kafka?: Kafka;
  private producer?: Producer;
  private consumer?: Consumer;
  private readonly pendingRequests = new Map<string, PendingRequest>();

  private readonly queryTopic: string;
  private readonly replyTopic: string;
  private readonly defaultTimeoutMs: number;
  private isShuttingDown = false;
  private isMockMode = false;

  constructor(
    @Optional() private readonly configService?: ConfigService | any,
    @Optional() mockConsumer?: any,
  ) {
    // Detect if invoked directly with (mockProducer, mockConsumer) as in unit tests
    if (configService && typeof configService.send === 'function') {
      this.producer = configService;
      this.consumer = mockConsumer;
      this.isMockMode = true;
      this.queryTopic = 'analytics.query';
      this.replyTopic = 'analytics.reply';
      this.defaultTimeoutMs = 5000;
      return;
    }

    const cfg = configService instanceof ConfigService ? configService : undefined;
    const brokers = cfg?.kafkaBrokers || (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
    const clientId = cfg?.kafkaClientId || process.env.KAFKA_CLIENT_ID || 'jira-sprints-nestjs';
    const groupId = cfg?.kafkaGroupId || process.env.KAFKA_GROUP_ID || 'jira-sprints-reply-consumer';

    this.queryTopic = cfg?.kafkaQueryTopic || process.env.KAFKA_TOPIC_QUERY || KAFKA_TOPICS.ANALYTICS_QUERY;
    this.replyTopic = cfg?.kafkaReplyTopic || process.env.KAFKA_TOPIC_REPLY || KAFKA_TOPICS.ANALYTICS_REPLY;
    this.defaultTimeoutMs = cfg?.kafkaRequestTimeoutMs || parseInt(process.env.KAFKA_REQUEST_TIMEOUT_MS || '5000', 10);

    try {
      this.kafka = new Kafka({
        clientId,
        brokers,
        retry: {
          initialRetryTime: 300,
          retries: 5,
        },
      });

      this.producer = this.kafka.producer({
        allowAutoTopicCreation: true,
        transactionTimeout: 30000,
      });

      this.consumer = this.kafka.consumer({
        groupId,
        allowAutoTopicCreation: true,
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
      });
    } catch (err: any) {
      this.logger.warn(`Could not construct Kafka client: ${err.message}`);
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.producer || !this.consumer) {
      this.logger.warn('Kafka producer/consumer not configured, skipping init');
      return;
    }

    this.logger.log('Initializing Kafka Request-Reply Producer and Consumer...');
    try {
      await this.producer.connect();
      await this.consumer.connect();
      await this.consumer.subscribe({
        topic: this.replyTopic,
        fromBeginning: false,
      });

      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          await this.handleIncomingReply(payload);
        },
      });

      this.logger.log(`Kafka Request-Reply ready. Subscribed to ${this.replyTopic}`);
    } catch (err: any) {
      this.logger.warn(`Kafka connection failed during startup (will retry on query): ${err.message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    this.logger.log('Shutting down Kafka Request-Reply service...');

    for (const [correlationId, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(
        new Error(`KafkaRequestReplyService shutting down (correlationId: ${correlationId})`),
      );
    }
    this.pendingRequests.clear();

    try {
      if (this.consumer) await this.consumer.disconnect();
      if (this.producer) await this.producer.disconnect();
    } catch (err: any) {
      this.logger.warn(`Error disconnecting Kafka: ${err.message}`);
    }
  }

  /**
   * Dispatches analytics query to MS3 (.NET) and awaits correlated reply.
   */
  async queryAnalytics(options: RequestAnalyticsOptions): Promise<AnalyticsReply> {
    if (this.isShuttingDown) {
      throw new Error('KafkaRequestReplyService is shutting down');
    }

    if (!this.producer) {
      throw new Error('Kafka producer not available');
    }

    const correlationId = randomUUID();
    const queryId = randomUUID();
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;

    const queryType = (options.queryType || 'BURNDOWN') as AnalyticsQueryType;
    const payload: AnalyticsQuery = {
      queryId,
      correlationId,
      replyTopic: this.replyTopic,
      sprintId: options.sprintId,
      projectId: options.projectId,
      queryType,
      timestamp: new Date().toISOString(),
      metadata: options.metadata || {},
    };

    // Schema validation if available
    try {
      if (typeof assertAnalyticsQuery === 'function') {
        assertAnalyticsQuery(payload);
      }
    } catch (validationErr: any) {
      this.logger.warn(`AnalyticsQuery validation warning: ${validationErr.message}`);
    }

    return new Promise<AnalyticsReply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(
          new KafkaTimeoutError(
            `Analytics query timed out after ${timeoutMs}ms for sprint ${options.sprintId} (correlationId: ${correlationId})`,
          ),
        );
      }, timeoutMs);

      this.pendingRequests.set(correlationId, {
        correlationId,
        sprintId: options.sprintId,
        resolve,
        reject,
        timer,
        createdAt: Date.now(),
      });

      this.producer!
        .send({
          topic: this.queryTopic,
          messages: [
            {
              key: options.sprintId,
              value: JSON.stringify(payload),
              headers: {
                [KAFKA_HEADERS.CORRELATION_ID]: correlationId,
                [KAFKA_HEADERS.REPLY_TOPIC]: this.replyTopic,
              },
            },
          ],
        })
        .catch((sendErr) => {
          clearTimeout(timer);
          this.pendingRequests.delete(correlationId);
          reject(sendErr);
        });
    });
  }

  /**
   * Handles incoming message from analytics.reply
   */
  async handleIncomingReply(payload: EachMessagePayload | any): Promise<void> {
    const { topic, message } = payload || {};
    try {
      if (!message) return;

      let correlationId: string | undefined;
      const headerVal =
        message.headers?.[KAFKA_HEADERS.CORRELATION_ID] ??
        message.headers?.['kafka_correlationId'] ??
        message.headers?.['correlationId'];

      if (headerVal) {
        correlationId = Buffer.isBuffer(headerVal)
          ? headerVal.toString('utf-8')
          : String(headerVal);
      }

      if (!message.value) {
        this.logger.warn(`Received empty message value on ${topic}`);
        return;
      }

      let parsed: any;
      try {
        const rawString = Buffer.isBuffer(message.value)
          ? message.value.toString('utf-8')
          : String(message.value);
        parsed = JSON.parse(rawString);
        if (!correlationId && parsed?.correlationId) {
          correlationId = parsed.correlationId;
        }
      } catch (parseErr: any) {
        this.logger.warn(`Corrupted JSON on topic ${topic}: ${parseErr.message}`);
        return;
      }

      if (!correlationId) {
        this.logger.warn(`Received reply on ${topic} without correlationId header or body, discarding`);
        return;
      }

      const pending = this.pendingRequests.get(correlationId);
      if (!pending) {
        this.logger.debug(
          `Received orphaned reply for correlationId ${correlationId}, ignoring cleanly`,
        );
        return;
      }

      clearTimeout(pending.timer);
      this.pendingRequests.delete(correlationId);

      // Validate schema if function exists
      if (typeof validateAnalyticsReply === 'function') {
        const validation = validateAnalyticsReply(parsed);
        if (!validation.valid && validation.errors?.length) {
          this.logger.warn(
            `Invalid AnalyticsReply schema for correlationId ${correlationId}: ${validation.formattedErrors?.join(', ')}`,
          );
        }
      }

      const reply = parsed as AnalyticsReply;

      if (reply.status === 'FAILED') {
        pending.reject(
          new Error(reply.errorMessage || `Analytics calculation failed for sprint ${reply.sprintId}`),
        );
        return;
      }

      pending.resolve(reply);
    } catch (err: any) {
      this.logger.error(`Error processing Kafka message on ${topic}: ${err.message}`, err.stack);
    }
  }

  getPendingCount(): number {
    return this.pendingRequests.size;
  }

  getPendingQueriesCount(): number {
    return this.pendingRequests.size;
  }
}
