import { KafkaRequestReplyService } from './kafka-request-reply.service';

describe('KafkaRequestReplyService', () => {
  let service: KafkaRequestReplyService;
  let mockProducer: any;
  let mockConsumer: any;
  let simulatedMessageHandler: any;

  beforeEach(() => {
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
  });

  afterEach(async () => {
    jest.clearAllTimers();
    await service.onModuleDestroy();
  });

  it('should dispatch query and resolve promise when matching reply arrives', async () => {
    await service.onModuleInit();

    const queryPromise = service.queryAnalytics({
      sprintId: '11111111-1111-1111-1111-111111111111',
      queryType: 'BURNDOWN',
    });

    expect(mockProducer.send).toHaveBeenCalledTimes(1);
    const sentPayload = JSON.parse(mockProducer.send.mock.calls[0][0].messages[0].value);
    const correlationId = sentPayload.correlationId;

    const simulatedReply = {
      replyId: 'reply-1',
      correlationId: correlationId,
      sprintId: '11111111-1111-1111-1111-111111111111',
      status: 'SUCCESS',
      velocity: 28.5,
      timestamp: new Date().toISOString(),
    };

    await simulatedMessageHandler({
      topic: 'analytics.reply',
      partition: 0,
      message: {
        value: Buffer.from(JSON.stringify(simulatedReply)),
        headers: { kafka_correlationId: Buffer.from(correlationId) },
      },
    });

    const response = await queryPromise;
    expect(response).toEqual(simulatedReply);
    expect(service.getPendingQueriesCount()).toBe(0);
  });

  it('should reject with TimeoutError when no reply arrives within 5000ms', async () => {
    jest.useFakeTimers();
    await service.onModuleInit();

    const queryPromise = service.queryAnalytics({
      sprintId: 'sprint-timeout',
      queryType: 'VELOCITY',
    });

    expect(service.getPendingQueriesCount()).toBe(1);

    // Fast-forward past 5000ms timeout
    jest.advanceTimersByTime(5001);

    await expect(queryPromise).rejects.toThrow('Analytics query timed out after 5000ms');
    expect(service.getPendingQueriesCount()).toBe(0);
    jest.useRealTimers();
  });

  it('should safely ignore messages with unknown correlationId without crashing', async () => {
    await service.onModuleInit();

    const orphanReply = {
      replyId: 'orphan-1',
      correlationId: 'unknown-uuid-0000',
      sprintId: 'sprint-x',
      status: 'SUCCESS',
      timestamp: new Date().toISOString(),
    };

    await expect(
      simulatedMessageHandler({
        topic: 'analytics.reply',
        partition: 0,
        message: {
          value: Buffer.from(JSON.stringify(orphanReply)),
          headers: {},
        },
      }),
    ).resolves.not.toThrow();
  });

  it('should safely catch and discard malformed non-JSON payloads', async () => {
    await service.onModuleInit();

    await expect(
      simulatedMessageHandler({
        topic: 'analytics.reply',
        partition: 0,
        message: {
          value: Buffer.from('NOT_VALID_JSON{{{'),
        },
      }),
    ).resolves.not.toThrow();
  });

  it('should reject if reply has status FAILED', async () => {
    await service.onModuleInit();

    const queryPromise = service.queryAnalytics({
      sprintId: 'sprint-fail',
      queryType: 'BURNDOWN',
    });

    const sentPayload = JSON.parse(mockProducer.send.mock.calls[0][0].messages[0].value);
    const correlationId = sentPayload.correlationId;

    await simulatedMessageHandler({
      topic: 'analytics.reply',
      partition: 0,
      message: {
        value: Buffer.from(
          JSON.stringify({
            replyId: 'reply-err',
            correlationId,
            sprintId: 'sprint-fail',
            status: 'FAILED',
            errorMessage: 'Computation failed',
            timestamp: new Date().toISOString(),
          }),
        ),
      },
    });

    await expect(queryPromise).rejects.toThrow('Computation failed');
  });
});
