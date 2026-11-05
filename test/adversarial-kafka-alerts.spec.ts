import { KafkaRequestReplyService, KafkaTimeoutError } from '../src/kafka/kafka-request-reply.service';
import { AlertService } from '../src/alerts/services/alert.service';
import { AlertGrpcController } from '../src/alerts/controllers/alert-grpc.controller';
import { GrpcExceptionFilter } from '../src/common/filters/grpc-exception.filter';
import { InvalidArgumentException } from '../src/common/exceptions/domain.exceptions';
import {
  KAFKA_TOPICS,
  KAFKA_HEADERS,
  assertAnalyticsQuery,
  validateAnalyticsReply,
  AnalyticsQueryType,
} from 'jira-contracts';
import { AlertType, AlertSeverity } from 'jira-contracts/gen/ts';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('Adversarial Challenge Suite: Kafka Request-Reply & AlertService', () => {
  // ==========================================================================
  // Section 1: Kafka Request-Reply Protocol & Header Conformance
  // ==========================================================================
  describe('1. Kafka Request-Reply Protocol & Header Conformance', () => {
    let service: KafkaRequestReplyService;
    let mockProducer: any;
    let mockConsumer: any;
    let simulatedMessageHandler: (payload: any) => Promise<void>;

    beforeEach(async () => {
      mockProducer = {
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        send: jest.fn().mockResolvedValue([{ topicName: 'analytics.query', partition: 0, errorCode: 0 }]),
      };

      mockConsumer = {
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        subscribe: jest.fn().mockResolvedValue(undefined),
        run: jest.fn().mockImplementation(async ({ eachMessage }) => {
          simulatedMessageHandler = eachMessage;
        }),
      };

      service = new KafkaRequestReplyService(mockProducer, mockConsumer);
      await service.onModuleInit();
    });

    afterEach(async () => {
      await service.onModuleDestroy();
    });

    it('1.1 should dispatch to topic "analytics.query" with required headers and valid UUIDs', async () => {
      const sprintId = '22222222-2222-2222-2222-222222222222';
      const promise = service.queryAnalytics({
        sprintId,
        queryType: 'BURNDOWN',
      });

      expect(mockProducer.send).toHaveBeenCalledTimes(1);
      const callArg = mockProducer.send.mock.calls[0][0];

      // Verify exact topic name
      expect(callArg.topic).toBe('analytics.query');
      expect(callArg.topic).toBe(KAFKA_TOPICS.ANALYTICS_QUERY);

      const message = callArg.messages[0];
      expect(message.key).toBe(sprintId);

      // Verify headers
      expect(message.headers).toBeDefined();
      expect(message.headers[KAFKA_HEADERS.CORRELATION_ID]).toBeDefined();
      expect(message.headers['kafka_correlationId']).toBeDefined();
      expect(message.headers[KAFKA_HEADERS.REPLY_TOPIC]).toBe('analytics.reply');
      expect(message.headers['kafka_replyTopic']).toBe(KAFKA_TOPICS.ANALYTICS_REPLY);

      // Correlation ID must be a valid UUID v4
      const correlationId = message.headers[KAFKA_HEADERS.CORRELATION_ID];
      expect(correlationId).toMatch(UUID_REGEX);

      // Verify payload and Ajv Schema Validation against jira-contracts schema
      const payload = JSON.parse(message.value);
      expect(payload.correlationId).toBe(correlationId);
      expect(payload.sprintId).toBe(sprintId);
      expect(payload.replyTopic).toBe('analytics.reply');
      expect(payload.queryType).toBe('BURNDOWN');
      expect(payload.queryId).toMatch(UUID_REGEX);
      expect(payload.timestamp).toBeDefined();

      // STRICT SCHEMA ASSERTION
      expect(() => assertAnalyticsQuery(payload)).not.toThrow();

      // Complete reply to clean up
      await simulatedMessageHandler({
        topic: 'analytics.reply',
        partition: 0,
        message: {
          value: Buffer.from(
            JSON.stringify({
              replyId: '33333333-3333-3333-3333-333333333333',
              correlationId,
              sprintId,
              status: 'SUCCESS',
              timestamp: new Date().toISOString(),
            }),
          ),
          headers: { kafka_correlationId: Buffer.from(correlationId) },
        },
      });

      await expect(promise).resolves.toBeDefined();
      expect(service.getPendingQueriesCount()).toBe(0);
    });

    it('1.2 should support all defined AnalyticsQueryType enum values compliant with JSON schema', async () => {
      const validQueryTypes: AnalyticsQueryType[] = [
        'BURNDOWN',
        'VELOCITY',
        'SPRINT_HEALTH',
        'FULL_DIAGNOSTIC',
        'BURNDOWN_SNAPSHOT',
        'VELOCITY_FORECAST',
        'SPRINT_HEALTH_AUDIT',
      ];

      for (const qType of validQueryTypes) {
        const sprintId = '44444444-4444-4444-4444-444444444444';
        const p = service.queryAnalytics({
          sprintId,
          queryType: qType,
        });

        const lastCall = mockProducer.send.mock.calls[mockProducer.send.mock.calls.length - 1][0];
        const payload = JSON.parse(lastCall.messages[0].value);
        expect(payload.queryType).toBe(qType);
        expect(() => assertAnalyticsQuery(payload)).not.toThrow();

        // Reply immediately
        await simulatedMessageHandler({
          topic: 'analytics.reply',
          message: {
            value: Buffer.from(
              JSON.stringify({
                replyId: '55555555-5555-5555-5555-555555555555',
                correlationId: payload.correlationId,
                sprintId,
                status: 'SUCCESS',
                timestamp: new Date().toISOString(),
              }),
            ),
            headers: { kafka_correlationId: Buffer.from(payload.correlationId) },
          },
        });

        await expect(p).resolves.toBeDefined();
      }
      expect(service.getPendingQueriesCount()).toBe(0);
    });

    it('1.3 should accept rich reply conforming to analytics.reply.json schema', async () => {
      const sprintId = '66666666-6666-6666-6666-666666666666';
      const p = service.queryAnalytics({ sprintId });

      const lastCall = mockProducer.send.mock.calls[0][0];
      const sentPayload = JSON.parse(lastCall.messages[0].value);
      const correlationId = sentPayload.correlationId;

      const fullReply = {
        replyId: '77777777-7777-7777-7777-777777777777',
        correlationId,
        sprintId,
        status: 'SUCCESS' as const,
        errorMessage: null,
        totalPoints: 50,
        completedPoints: 35,
        remainingPoints: 15,
        velocity: 28.5,
        healthScore: 88.0,
        burndownData: [
          {
            date: '2026-10-20',
            dayIndex: 0,
            idealRemaining: 50,
            actualRemaining: 50,
            completedOnDay: 0,
          },
          {
            date: '2026-10-21',
            dayIndex: 1,
            idealRemaining: 40,
            actualRemaining: 35,
            completedOnDay: 15,
          },
        ],
        diagnostics: ['Velocity is on track', 'Low bottleneck risk'],
        recommendations: ['Maintain current WIP limits'],
        timestamp: new Date().toISOString(),
      };

      // Assert reply conforms to official schema
      const schemaValidation = validateAnalyticsReply(fullReply);
      expect(schemaValidation.valid).toBe(true);

      await simulatedMessageHandler({
        topic: 'analytics.reply',
        message: {
          value: Buffer.from(JSON.stringify(fullReply)),
          headers: { kafka_correlationId: Buffer.from(correlationId) },
        },
      });

      const result = await p;
      expect(result).toEqual(fullReply);
      expect(service.getPendingQueriesCount()).toBe(0);
    });
  });

  // ==========================================================================
  // Section 2: Timeout Handling & Circuit Breaking
  // ==========================================================================
  describe('2. Timeout Handling & Circuit Breaking', () => {
    let service: KafkaRequestReplyService;
    let mockProducer: any;
    let mockConsumer: any;
    let simulatedMessageHandler: (payload: any) => Promise<void>;

    beforeEach(async () => {
      mockProducer = {
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        send: jest.fn().mockResolvedValue([]),
      };

      mockConsumer = {
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        subscribe: jest.fn().mockResolvedValue(undefined),
        run: jest.fn().mockImplementation(async ({ eachMessage }) => {
          simulatedMessageHandler = eachMessage;
        }),
      };

      service = new KafkaRequestReplyService(mockProducer, mockConsumer);
      await service.onModuleInit();
    });

    afterEach(async () => {
      await service.onModuleDestroy();
    });

    it('2.1 should reject with KafkaTimeoutError after 5000ms and cleanly clear pending map (memory leak avoidance)', async () => {
      jest.useFakeTimers();

      const p = service.queryAnalytics({
        sprintId: 'sprint-timeout-1',
      });

      expect(service.getPendingQueriesCount()).toBe(1);

      // Advance by 4999ms - should still be pending
      jest.advanceTimersByTime(4999);
      expect(service.getPendingQueriesCount()).toBe(1);

      // Advance past 5000ms
      jest.advanceTimersByTime(2);

      await expect(p).rejects.toThrow(KafkaTimeoutError);
      await expect(p).rejects.toThrow(/timed out after 5000ms/);

      // Memory leak verification: pending map must be 0
      expect(service.getPendingQueriesCount()).toBe(0);

      jest.useRealTimers();
    });

    it('2.2 should honor custom timeoutMs option', async () => {
      jest.useFakeTimers();

      const p = service.queryAnalytics({
        sprintId: 'sprint-timeout-custom',
        timeoutMs: 1500,
      });

      expect(service.getPendingQueriesCount()).toBe(1);

      jest.advanceTimersByTime(1499);
      expect(service.getPendingQueriesCount()).toBe(1);

      jest.advanceTimersByTime(2);
      await expect(p).rejects.toThrow(KafkaTimeoutError);
      await expect(p).rejects.toThrow(/timed out after 1500ms/);
      expect(service.getPendingQueriesCount()).toBe(0);

      jest.useRealTimers();
    });

    it('2.3 STRESS TEST: 100 concurrent requests timing out concurrently without memory leak', async () => {
      jest.useFakeTimers();

      const concurrentCount = 100;
      const promises: Promise<any>[] = [];

      for (let i = 0; i < concurrentCount; i++) {
        promises.push(
          service.queryAnalytics({
            sprintId: `sprint-stress-${i}`,
          }),
        );
      }

      expect(service.getPendingQueriesCount()).toBe(concurrentCount);

      // Advance timers to trigger all timeouts
      jest.advanceTimersByTime(5001);

      const results = await Promise.allSettled(promises);
      expect(results.length).toBe(concurrentCount);

      for (const res of results) {
        expect(res.status).toBe('rejected');
        if (res.status === 'rejected') {
          expect(res.reason).toBeInstanceOf(KafkaTimeoutError);
        }
      }

      // Assert memory leak avoidance: 0 pending requests remaining
      expect(service.getPendingQueriesCount()).toBe(0);

      jest.useRealTimers();
    });

    it('2.4 should cleanly reject when MS3 returns status FAILED with error message', async () => {
      const p = service.queryAnalytics({ sprintId: 'sprint-fail-1' });

      const lastCall = mockProducer.send.mock.calls[0][0];
      const sent = JSON.parse(lastCall.messages[0].value);

      await simulatedMessageHandler({
        topic: 'analytics.reply',
        message: {
          value: Buffer.from(
            JSON.stringify({
              replyId: 'rep-err-1',
              correlationId: sent.correlationId,
              sprintId: 'sprint-fail-1',
              status: 'FAILED',
              errorMessage: 'Historical velocity data insufficient for sprint forecasting',
              timestamp: new Date().toISOString(),
            }),
          ),
          headers: { kafka_correlationId: Buffer.from(sent.correlationId) },
        },
      });

      await expect(p).rejects.toThrow('Historical velocity data insufficient for sprint forecasting');
      expect(service.getPendingQueriesCount()).toBe(0);
    });

    it('2.5 should reject and cleanup immediately if producer.send throws', async () => {
      mockProducer.send.mockRejectedValueOnce(new Error('Broker transport socket closed'));

      const p = service.queryAnalytics({ sprintId: 'sprint-producer-fail' });

      await expect(p).rejects.toThrow('Broker transport socket closed');
      expect(service.getPendingQueriesCount()).toBe(0);
    });
  });

  // ==========================================================================
  // Section 3: Noise & Malformed Payload Resilience
  // ==========================================================================
  describe('3. Noise & Malformed Payload Resilience', () => {
    let service: KafkaRequestReplyService;
    let mockProducer: any;
    let mockConsumer: any;
    let simulatedMessageHandler: (payload: any) => Promise<void>;

    beforeEach(async () => {
      mockProducer = {
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        send: jest.fn().mockResolvedValue([]),
      };

      mockConsumer = {
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        subscribe: jest.fn().mockResolvedValue(undefined),
        run: jest.fn().mockImplementation(async ({ eachMessage }) => {
          simulatedMessageHandler = eachMessage;
        }),
      };

      service = new KafkaRequestReplyService(mockProducer, mockConsumer);
      await service.onModuleInit();
    });

    afterEach(async () => {
      await service.onModuleDestroy();
    });

    it('3.1 should gracefully discard malformed, corrupted, or binary payloads without crashing consumer', async () => {
      const noisyInputs = [
        'NOT_A_JSON{{{',
        '{"incomplete": true, "corrupted":',
        '',
        Buffer.from([0x00, 0x1f, 0x8b, 0x08, 0xff, 0xff]),
        Buffer.from('Hello non-json world!'),
        Buffer.from(''),
        null,
      ];

      for (const noise of noisyInputs) {
        await expect(
          simulatedMessageHandler({
            topic: 'analytics.reply',
            partition: 0,
            message: {
              value: noise !== null ? (Buffer.isBuffer(noise) ? noise : Buffer.from(noise)) : null,
              headers: {},
            },
          }),
        ).resolves.not.toThrow();
      }
    });

    it('3.2 should gracefully ignore replies with unknown correlation IDs without crashing or hanging', async () => {
      await expect(
        simulatedMessageHandler({
          topic: 'analytics.reply',
          message: {
            value: Buffer.from(
              JSON.stringify({
                replyId: 'unknown-reply',
                correlationId: '00000000-0000-0000-0000-000000000000',
                sprintId: 'sprint-orphan',
                status: 'SUCCESS',
                timestamp: new Date().toISOString(),
              }),
            ),
            headers: {
              kafka_correlationId: Buffer.from('00000000-0000-0000-0000-000000000000'),
            },
          },
        }),
      ).resolves.not.toThrow();

      expect(service.getPendingQueriesCount()).toBe(0);
    });

    it('3.3 should handle duplicate replies idempotently without secondary errors', async () => {
      const p = service.queryAnalytics({ sprintId: 'sprint-dup' });
      const sent = JSON.parse(mockProducer.send.mock.calls[0][0].messages[0].value);
      const replyMsg = {
        topic: 'analytics.reply',
        message: {
          value: Buffer.from(
            JSON.stringify({
              replyId: 'rep-dup-1',
              correlationId: sent.correlationId,
              sprintId: 'sprint-dup',
              status: 'SUCCESS',
              velocity: 30,
              timestamp: new Date().toISOString(),
            }),
          ),
          headers: { kafka_correlationId: Buffer.from(sent.correlationId) },
        },
      };

      // First delivery: resolves query
      await simulatedMessageHandler(replyMsg);
      const res = await p;
      expect(res.status).toBe('SUCCESS');
      expect(service.getPendingQueriesCount()).toBe(0);

      // Second delivery (Kafka at-least-once duplicate): must be cleanly ignored
      await expect(simulatedMessageHandler(replyMsg)).resolves.not.toThrow();
      expect(service.getPendingQueriesCount()).toBe(0);
    });

    it('3.4 STRESS TEST: Interleaved noise and high concurrent throughput', async () => {
      // 30 valid queries + 10 failing queries + 10 timeout queries = 50 concurrent queries
      // Interleaved with 50 malformed noise packets
      jest.useFakeTimers();

      const totalQueries = 50;
      const queryPromises: { promise: Promise<any>; correlationId: string; type: 'valid' | 'fail' | 'timeout' }[] = [];

      for (let i = 0; i < totalQueries; i++) {
        const type = i < 30 ? 'valid' : i < 40 ? 'fail' : 'timeout';
        const promise = service.queryAnalytics({ sprintId: `sprint-stress-${i}` });
        const lastCall = mockProducer.send.mock.calls[i][0];
        const correlationId = JSON.parse(lastCall.messages[0].value).correlationId;
        queryPromises.push({ promise, correlationId, type });
      }

      expect(service.getPendingQueriesCount()).toBe(50);

      // Feed 50 garbage messages into consumer
      for (let j = 0; j < 50; j++) {
        await simulatedMessageHandler({
          topic: 'analytics.reply',
          message: {
            value: Buffer.from(`GARBAGE_PAYLOAD_${j}_{{{`),
            headers: { kafka_correlationId: Buffer.from(`bogus-uuid-${j}`) },
          },
        });
      }

      // Deliver 30 valid replies
      for (let i = 0; i < 30; i++) {
        const item = queryPromises[i];
        await simulatedMessageHandler({
          topic: 'analytics.reply',
          message: {
            value: Buffer.from(
              JSON.stringify({
                replyId: `rep-ok-${i}`,
                correlationId: item.correlationId,
                sprintId: `sprint-stress-${i}`,
                status: 'SUCCESS',
                velocity: 25 + i,
                timestamp: new Date().toISOString(),
              }),
            ),
            headers: { kafka_correlationId: Buffer.from(item.correlationId) },
          },
        });
      }

      // Deliver 10 FAILED replies
      for (let i = 30; i < 40; i++) {
        const item = queryPromises[i];
        await simulatedMessageHandler({
          topic: 'analytics.reply',
          message: {
            value: Buffer.from(
              JSON.stringify({
                replyId: `rep-fail-${i}`,
                correlationId: item.correlationId,
                sprintId: `sprint-stress-${i}`,
                status: 'FAILED',
                errorMessage: `Failure simulation ${i}`,
                timestamp: new Date().toISOString(),
              }),
            ),
            headers: { kafka_correlationId: Buffer.from(item.correlationId) },
          },
        });
      }

      // 10 queries remain pending for timeout
      expect(service.getPendingQueriesCount()).toBe(10);

      // Fast-forward timeout past 5000ms
      jest.advanceTimersByTime(5001);

      // Verify all 50 settled correctly
      for (let i = 0; i < totalQueries; i++) {
        const item = queryPromises[i];
        if (item.type === 'valid') {
          const res = await item.promise;
          expect(res.status).toBe('SUCCESS');
        } else if (item.type === 'fail') {
          await expect(item.promise).rejects.toThrow(`Failure simulation ${i}`);
        } else {
          await expect(item.promise).rejects.toThrow(KafkaTimeoutError);
        }
      }

      // Assert complete cleanup
      expect(service.getPendingQueriesCount()).toBe(0);

      jest.useRealTimers();
    });
  });

  // ==========================================================================
  // Section 4: AlertService Robustness
  // ==========================================================================
  describe('4. AlertService Robustness', () => {
    let alertService: AlertService;
    let mockRepo: any;
    let controller: AlertGrpcController;
    let filter: GrpcExceptionFilter;

    beforeEach(() => {
      mockRepo = {
        save: jest.fn().mockImplementation(async (entity) => ({
          ...entity,
          id: entity.id || 'alert-generated-1',
        })),
        create: jest.fn((entity) => entity),
      };

      alertService = new AlertService(mockRepo);
      controller = new AlertGrpcController(alertService);
      filter = new GrpcExceptionFilter();
    });

    it('4.1 should reject unspecified alert type (0) with INVALID_ARGUMENT', async () => {
      const invalidRequests = [
        { sprintId: 'sprint-1', type: 0 },
        { sprintId: 'sprint-1', alertType: 0 },
        { sprintId: 'sprint-1', alert_type: 0 },
        { sprintId: 'sprint-1', type: AlertType.ALERT_TYPE_UNSPECIFIED },
      ];

      for (const req of invalidRequests) {
        let thrownError: any;
        try {
          await alertService.triggerSprintAlert(req);
        } catch (err) {
          thrownError = err;
        }

        expect(thrownError).toBeDefined();
        expect(thrownError).toBeInstanceOf(InvalidArgumentException);
        expect(thrownError).toBeInstanceOf(RpcException);
        expect(thrownError.code).toBe(status.INVALID_ARGUMENT);
        expect(thrownError.code).toBe(3);

        // Verify filter maps to gRPC status INVALID_ARGUMENT (3)
        const filtered$ = filter.catch(thrownError);
        await expect(lastValueFrom(filtered$)).rejects.toEqual(
          expect.objectContaining({
            code: status.INVALID_ARGUMENT,
          }),
        );
      }

      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('4.2 should reject out-of-bounds alert types (< 0 or > 3) with INVALID_ARGUMENT', async () => {
      const invalidTypes = [-1, -99, 4, 5, 999];

      for (const invalidType of invalidTypes) {
        await expect(
          alertService.triggerSprintAlert({
            sprintId: 'sprint-1',
            type: invalidType,
          }),
        ).rejects.toThrow(InvalidArgumentException);
      }

      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('4.3 should reject missing, empty, or whitespace-only sprintId with INVALID_ARGUMENT', async () => {
      const invalidSprintRequests = [
        { sprintId: '', type: 1 },
        { sprintId: '   ', type: 1 },
        { sprintId: null, type: 1 },
        { sprintId: undefined, type: 1 },
        { type: 1 },
      ];

      for (const req of invalidSprintRequests) {
        let thrownError: any;
        try {
          await alertService.triggerSprintAlert(req);
        } catch (err) {
          thrownError = err;
        }

        expect(thrownError).toBeDefined();
        expect(thrownError).toBeInstanceOf(InvalidArgumentException);
        expect(thrownError.code).toBe(status.INVALID_ARGUMENT);
      }

      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('4.4 should accept all valid alert types (1, 2, 3) and return acknowledged=true with valid alertId', async () => {
      const validCases = [
        {
          name: 'ALERT_TYPE_SCOPE_CREEP',
          req: {
            sprintId: '11111111-1111-1111-1111-111111111111',
            type: AlertType.ALERT_TYPE_SCOPE_CREEP,
            severity: AlertSeverity.ALERT_SEVERITY_WARNING,
            message: 'Scope creep detected: 12 story points added mid-sprint',
            recommendation: 'Freeze scope or negotiate backlog items',
          },
        },
        {
          name: 'ALERT_TYPE_VELOCITY_DEFICIT',
          req: {
            sprint_id: '11111111-1111-1111-1111-111111111111',
            alert_type: AlertType.ALERT_TYPE_VELOCITY_DEFICIT,
            severity: AlertSeverity.ALERT_SEVERITY_CRITICAL,
            message: 'Velocity deficit: current run-rate is 40% below historical capacity',
            recommendation: 'Re-estimate remaining tasks',
          },
        },
        {
          name: 'ALERT_TYPE_BOTTLENECK_DETECTED',
          req: {
            sprintId: '11111111-1111-1111-1111-111111111111',
            alertType: AlertType.ALERT_TYPE_BOTTLENECK_DETECTED,
            severity: AlertSeverity.ALERT_SEVERITY_INFO,
            message: 'Code review queue bottleneck detected (> 5 PRs waiting)',
            recommendation: 'Allocate swarm review time',
          },
        },
      ];

      for (const { req } of validCases) {
        const response = await alertService.triggerSprintAlert(req);

        expect(response.acknowledged).toBe(true);
        expect(response.alertId).toBeDefined();
        expect(response.alertId).toMatch(/^alert-/);
        expect(response.alert_id).toBe(response.alertId);
      }

      expect(mockRepo.save).toHaveBeenCalledTimes(3);

      // Verify entity properties passed to repository
      const savedEntity = mockRepo.save.mock.calls[0][0];
      expect(savedEntity.acknowledged).toBe(true);
      expect(savedEntity.timestamp).toBeGreaterThan(0);
      expect(savedEntity.sprintId).toBe('11111111-1111-1111-1111-111111111111');
      expect(savedEntity.type).toBe(AlertType.ALERT_TYPE_SCOPE_CREEP);
    });

    it('4.5 should verify AlertGrpcController routes TriggerSprintAlert and TriggerAlert to service', async () => {
      const validReq = {
        sprint_id: 'sprint-ctrl-1',
        type: AlertType.ALERT_TYPE_SCOPE_CREEP,
        severity: AlertSeverity.ALERT_SEVERITY_WARNING,
        message: 'Controller test alert',
      };

      const res1 = await controller.triggerSprintAlert(validReq);
      expect(res1.acknowledged).toBe(true);
      expect(res1.alertId).toMatch(/^alert-/);

      const res2 = await controller.triggerAlert(validReq);
      expect(res2.acknowledged).toBe(true);
      expect(res2.alertId).toMatch(/^alert-/);

      expect(mockRepo.save).toHaveBeenCalledTimes(2);
    });
  });
});
