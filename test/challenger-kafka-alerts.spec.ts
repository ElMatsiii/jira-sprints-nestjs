import { KafkaRequestReplyService, KafkaTimeoutError } from '../src/kafka/kafka-request-reply.service';
import { AlertService } from '../src/alerts/services/alert.service';
import { AlertGrpcController } from '../src/alerts/controllers/alert-grpc.controller';
import { GrpcExceptionFilter } from '../src/common/filters/grpc-exception.filter';
import { InvalidArgumentException } from '../src/common/exceptions/domain.exceptions';
import {
  KAFKA_TOPICS,
  KAFKA_HEADERS,
  assertAnalyticsQuery,
  validateAnalyticsQuery,
  validateAnalyticsReply,
  AnalyticsReply,
} from 'jira-contracts';
import { AlertType, AlertSeverity } from 'jira-contracts/gen/ts';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { firstValueFrom } from 'rxjs';

describe('Empirical Challenger: Kafka Request-Reply & AlertService Invariants', () => {
  // Helper to extract gRPC error from exception filter
  const filterException = async (filter: GrpcExceptionFilter, err: any) => {
    try {
      const obs = filter.catch(err);
      await firstValueFrom(obs);
      throw new Error('Expected filter to emit error');
    } catch (filteredErr) {
      return filteredErr as { code: number; message: string };
    }
  };

  // =========================================================================
  // Challenge 1: Kafka Request-Reply Schema Validation & Correlation ID Invariants
  // =========================================================================
  describe('Challenge 1: Kafka Request-Reply Schema Validation & Correlation ID Invariants', () => {
    let service: KafkaRequestReplyService;
    let mockProducer: any;
    let mockConsumer: any;
    let messageHandler: (payload: any) => Promise<void>;

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
          messageHandler = eachMessage;
        }),
      };

      service = new KafkaRequestReplyService(mockProducer, mockConsumer);
      await service.onModuleInit();
    });

    afterEach(async () => {
      await service.onModuleDestroy();
    });

    it('1.1 should generate strictly valid UUID v4 for queryId and correlationId matching analytics.query.json schema', async () => {
      const sprintId = '11111111-1111-1111-1111-111111111111';
      const p = service.queryAnalytics({
        sprintId,
        queryType: 'BURNDOWN',
      });

      expect(mockProducer.send).toHaveBeenCalledTimes(1);
      const call = mockProducer.send.mock.calls[0][0];

      expect(call.topic).toBe('analytics.query');
      expect(call.topic).toBe(KAFKA_TOPICS.ANALYTICS_QUERY);

      const msg = call.messages[0];
      const headerCorrId = msg.headers[KAFKA_HEADERS.CORRELATION_ID];
      const headerReplyTopic = msg.headers[KAFKA_HEADERS.REPLY_TOPIC];

      expect(headerCorrId).toBeDefined();
      expect(headerReplyTopic).toBe('analytics.reply');

      const payload = JSON.parse(msg.value);
      expect(payload.correlationId).toBe(headerCorrId);
      expect(payload.sprintId).toBe(sprintId);
      expect(payload.replyTopic).toBe('analytics.reply');

      // Validate against Ajv schema
      const queryValidation = validateAnalyticsQuery(payload);
      expect(queryValidation.valid).toBe(true);
      expect(() => assertAnalyticsQuery(payload)).not.toThrow();

      // Resolve query cleanly
      await messageHandler({
        topic: 'analytics.reply',
        message: {
          value: Buffer.from(
            JSON.stringify({
              replyId: '22222222-2222-2222-2222-222222222222',
              correlationId: headerCorrId,
              sprintId,
              status: 'SUCCESS',
              timestamp: new Date().toISOString(),
            }),
          ),
          headers: { kafka_correlationId: Buffer.from(headerCorrId) },
        },
      });

      await expect(p).resolves.toBeDefined();
    });

    it('1.2 should warn on non-UUID sprintId when asserted against analytics.query.json', async () => {
      // Non-UUID sprintId violates analytics.query.json schema (format: uuid)
      const nonUuidSprintId = 'sprint-non-uuid-123';
      const p = service.queryAnalytics({
        sprintId: nonUuidSprintId,
      });

      const call = mockProducer.send.mock.calls[0][0];
      const payload = JSON.parse(call.messages[0].value);
      const validation = validateAnalyticsQuery(payload);

      // Verify that the schema validator marks it invalid
      expect(validation.valid).toBe(false);
      expect(validation.formattedErrors?.[0]).toMatch(/must match format "uuid"/);

      // Complete to clean up
      await messageHandler({
        topic: 'analytics.reply',
        message: {
          value: Buffer.from(
            JSON.stringify({
              replyId: '33333333-3333-3333-3333-333333333333',
              correlationId: payload.correlationId,
              sprintId: nonUuidSprintId,
              status: 'SUCCESS',
              timestamp: new Date().toISOString(),
            }),
          ),
          headers: { kafka_correlationId: Buffer.from(payload.correlationId) },
        },
      });

      await expect(p).resolves.toBeDefined();
    });

    it('1.3 EMPIRICAL DEFECT PROOF: Null reply payload causes unhandled TypeError and leaves caller promise hanging forever', async () => {
      jest.useFakeTimers();

      const sprintId = '44444444-4444-4444-4444-444444444444';
      let promiseSettled = false;
      let settledError: any = null;

      const p = service.queryAnalytics({
        sprintId,
        timeoutMs: 5000,
      }).then(() => {
        promiseSettled = true;
      }).catch((err) => {
        promiseSettled = true;
        settledError = err;
      });

      const call = mockProducer.send.mock.calls[0][0];
      const correlationId = JSON.parse(call.messages[0].value).correlationId;

      expect(service.getPendingQueriesCount()).toBe(1);

      // MS3 sends corrupted message: JSON value is null, but correlationId header is present
      await messageHandler({
        topic: 'analytics.reply',
        message: {
          value: Buffer.from('null'),
          headers: { kafka_correlationId: Buffer.from(correlationId) },
        },
      });

      // Advance timers past 5000ms
      jest.advanceTimersByTime(5001);

      // EMPIRICAL OBSERVATION:
      // In current implementation, clearTimeout(pending.timer) was called, and
      // reply.status threw TypeError: Cannot read properties of null (reading 'status').
      // Therefore, the promise NEVER settled and the map was cleared!
      expect(service.getPendingQueriesCount()).toBe(0);
      expect(promiseSettled).toBe(false); // BUG: Caller is left hanging forever!

      jest.useRealTimers();
    });

    it('1.4 should handle reply with schema violations without crashing consumer', async () => {
      const sprintId = '55555555-5555-5555-5555-555555555555';
      const p = service.queryAnalytics({ sprintId });
      const call = mockProducer.send.mock.calls[0][0];
      const correlationId = JSON.parse(call.messages[0].value).correlationId;

      // Reply with invalid fields according to analytics.reply.json (healthScore > 100, negative points)
      const invalidReply = {
        replyId: '66666666-6666-6666-6666-666666666666',
        correlationId,
        sprintId,
        status: 'SUCCESS',
        healthScore: 500, // Invalid: maximum is 100
        totalPoints: -10, // Invalid: minimum is 0
        timestamp: new Date().toISOString(),
      };

      const schemaCheck = validateAnalyticsReply(invalidReply);
      expect(schemaCheck.valid).toBe(false);

      // Send to consumer
      await expect(
        messageHandler({
          topic: 'analytics.reply',
          message: {
            value: Buffer.from(JSON.stringify(invalidReply)),
            headers: { kafka_correlationId: Buffer.from(correlationId) },
          },
        }),
      ).resolves.not.toThrow();

      const result = await p;
      expect(result).toBeDefined();
      expect(service.getPendingQueriesCount()).toBe(0);
    });
  });

  // =========================================================================
  // Challenge 2: Leak-Free 5000ms Timeout & High Concurrency Stress Test
  // =========================================================================
  describe('Challenge 2: Leak-Free 5000ms Timeout & High Concurrency Stress Test', () => {
    let service: KafkaRequestReplyService;
    let mockProducer: any;
    let mockConsumer: any;
    let messageHandler: (payload: any) => Promise<void>;

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
          messageHandler = eachMessage;
        }),
      };

      service = new KafkaRequestReplyService(mockProducer, mockConsumer);
      await service.onModuleInit();
    });

    afterEach(async () => {
      await service.onModuleDestroy();
    });

    it('2.1 STRESS HARNESS: 200 concurrent requests with 50% timeout and 50% resolution without memory leaks', async () => {
      jest.useFakeTimers();

      const totalRequests = 200;
      const queries: { promise: Promise<any>; correlationId: string; shouldTimeout: boolean }[] = [];

      for (let i = 0; i < totalRequests; i++) {
        const shouldTimeout = i % 2 === 0;
        const promise = service.queryAnalytics({
          sprintId: `sprint-stress-${i}`,
          timeoutMs: 5000,
        });

        const call = mockProducer.send.mock.calls[i][0];
        const correlationId = JSON.parse(call.messages[0].value).correlationId;
        queries.push({ promise, correlationId, shouldTimeout });
      }

      expect(service.getPendingQueriesCount()).toBe(totalRequests);

      // Resolve the 50% that should succeed
      for (const q of queries) {
        if (!q.shouldTimeout) {
          await messageHandler({
            topic: 'analytics.reply',
            message: {
              value: Buffer.from(
                JSON.stringify({
                  replyId: `rep-${q.correlationId}`,
                  correlationId: q.correlationId,
                  sprintId: 'sprint-stress',
                  status: 'SUCCESS',
                  timestamp: new Date().toISOString(),
                }),
              ),
              headers: { kafka_correlationId: Buffer.from(q.correlationId) },
            },
          });
        }
      }

      expect(service.getPendingQueriesCount()).toBe(100);

      // Fast forward past 5000ms to trigger timeouts on the remaining 100
      jest.advanceTimersByTime(5001);

      const results = await Promise.allSettled(queries.map((q) => q.promise));
      expect(results.length).toBe(totalRequests);

      let resolvedCount = 0;
      let rejectedTimeoutCount = 0;

      for (const res of results) {
        if (res.status === 'fulfilled') {
          resolvedCount++;
        } else {
          rejectedTimeoutCount++;
          expect(res.reason).toBeInstanceOf(KafkaTimeoutError);
        }
      }

      expect(resolvedCount).toBe(100);
      expect(rejectedTimeoutCount).toBe(100);

      // ZERO RESIDUAL REQUESTS IN MAP (Leak-free proof)
      expect(service.getPendingQueriesCount()).toBe(0);

      jest.useRealTimers();
    });

    it('2.2 should clean up and cancel pending timers when onModuleDestroy is invoked', async () => {
      jest.useFakeTimers();

      const p1 = service.queryAnalytics({ sprintId: 'sprint-shutdown-1' });
      const p2 = service.queryAnalytics({ sprintId: 'sprint-shutdown-2' });

      expect(service.getPendingQueriesCount()).toBe(2);

      await service.onModuleDestroy();

      expect(service.getPendingQueriesCount()).toBe(0);
      await expect(p1).rejects.toThrow(/shutting down/i);
      await expect(p2).rejects.toThrow(/shutting down/i);

      jest.useRealTimers();
    });
  });

  // =========================================================================
  // Challenge 3: AlertService Adversarial Resilience & gRPC Invariants
  // =========================================================================
  describe('Challenge 3: AlertService Adversarial Resilience & gRPC Invariants', () => {
    let alertService: AlertService;
    let mockRepo: any;
    let controller: AlertGrpcController;
    let filter: GrpcExceptionFilter;

    beforeEach(() => {
      mockRepo = {
        save: jest.fn().mockImplementation(async (entity) => ({
          ...entity,
          id: entity.id || 'alert-test-id',
        })),
        create: jest.fn((entity) => entity),
      };

      alertService = new AlertService(mockRepo);
      controller = new AlertGrpcController(alertService);
      filter = new GrpcExceptionFilter();
    });

    it('3.1 EMPIRICAL DEFECT PROOF: AlertService fails to validate NaN / non-numeric string alert types', async () => {
      // In alert.service.ts:
      // const type = Number(rawType || 0);
      // if (type <= 0 || type > 3) { ... }
      // Because (NaN <= 0) === false and (NaN > 3) === false,
      // invalid string types like 'INVALID' or 'ALERT_TYPE_SCOPE_CREEP' bypass validation!

      const res = await alertService.triggerSprintAlert({
        sprintId: 'sprint-nan-test',
        type: 'INVALID' as any,
      });

      // EMPIRICAL OBSERVATION:
      // It succeeds instead of throwing InvalidArgumentException!
      expect(res.acknowledged).toBe(true);
      expect(mockRepo.save).toHaveBeenCalledTimes(1);

      const savedEntity = mockRepo.save.mock.calls[0][0];
      expect(Number.isNaN(savedEntity.type)).toBe(true); // BUG: entity.type is NaN!
    });

    it('3.2 should reject null, undefined, or empty sprintId with INVALID_ARGUMENT (code 3)', async () => {
      const invalidRequests = [
        { type: 1 },
        { sprintId: '', type: 1 },
        { sprintId: '   ', type: 1 },
        { sprint_id: '', type: 1 },
        { sprintId: null as any, type: 1 },
      ];

      for (const req of invalidRequests) {
        let err: any;
        try {
          await alertService.triggerSprintAlert(req);
        } catch (e) {
          err = e;
        }

        expect(err).toBeInstanceOf(InvalidArgumentException);
        expect(err.code).toBe(GrpcStatus.INVALID_ARGUMENT);

        const filtered = await filterException(filter, err);
        expect(filtered.code).toBe(GrpcStatus.INVALID_ARGUMENT);
      }
    });

    it('3.3 should handle repository database errors and map them without crashing or unhandled rejections', async () => {
      // Simulate database failure during alert persistence (e.g. connection lost or foreign key error)
      mockRepo.save.mockRejectedValueOnce(new Error('QueryFailedError: Connection terminated'));

      let err: any;
      try {
        await controller.triggerSprintAlert({
          sprintId: '11111111-1111-1111-1111-111111111111',
          type: AlertType.ALERT_TYPE_SCOPE_CREEP,
          message: 'Test DB failure',
        });
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(err.message).toMatch(/Connection terminated/);

      // Verify that GrpcExceptionFilter maps it cleanly to gRPC INTERNAL error (code 13)
      const filtered = await filterException(filter, err);
      expect(filtered.code).toBe(GrpcStatus.INTERNAL);
      expect(filtered.message).toMatch(/Connection terminated/);
    });

    it('3.4 should support extreme string lengths in message and recommendation without crashing', async () => {
      const hugeMessage = 'A'.repeat(50000);
      const hugeRecommendation = 'B'.repeat(50000);

      const res = await alertService.triggerSprintAlert({
        sprintId: 'sprint-huge-strings',
        type: AlertType.ALERT_TYPE_VELOCITY_DEFICIT,
        severity: AlertSeverity.ALERT_SEVERITY_WARNING,
        message: hugeMessage,
        recommendation: hugeRecommendation,
      });

      expect(res.acknowledged).toBe(true);
      expect(mockRepo.save).toHaveBeenCalledTimes(1);
      const saved = mockRepo.save.mock.calls[0][0];
      expect(saved.message.length).toBe(50000);
      expect(saved.recommendation.length).toBe(50000);
    });

    it('3.5 should accept both camelCase (sprintId, alertType) and snake_case (sprint_id, alert_type) from MS3 (.NET)', async () => {
      const dotNetPayload = {
        sprint_id: 'sprint-dotnet-1',
        alert_type: 3,
        severity: 2,
        message: 'Alert from .NET MS3',
        recommendation: 'Check sprint capacity',
      };

      const res = await controller.triggerSprintAlert(dotNetPayload);
      expect(res.acknowledged).toBe(true);
      expect(res.alert_id).toBeDefined();
      expect(res.alertId).toBeDefined();

      const saved = mockRepo.save.mock.calls[0][0];
      expect(saved.sprintId).toBe('sprint-dotnet-1');
      expect(saved.type).toBe(3);
    });
  });
});
