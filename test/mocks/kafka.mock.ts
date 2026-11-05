export const createMockKafkaProducer = () => ({
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  send: jest.fn().mockResolvedValue([{ topicName: 'analytics.query', partition: 0, errorCode: 0 }]),
});

export const createMockKafkaConsumer = () => ({
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn().mockResolvedValue(undefined),
  run: jest.fn().mockImplementation(async ({ eachMessage }) => {
    (createMockKafkaConsumer as any).triggerMessage = eachMessage;
  }),
});
