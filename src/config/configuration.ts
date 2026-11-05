export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  name: string;
  ssl: boolean;
  poolMax: number;
  retryAttempts: number;
  retryDelayMs: number;
}

export interface GrpcConfig {
  host: string;
  port: number;
  issuesGrpcUrl: string;
}

export interface KafkaConfig {
  brokers: string[];
  clientId: string;
  groupId: string;
  queryTopic: string;
  replyTopic: string;
  requestTimeoutMs: number;
}

export interface AppConfiguration {
  port: number;
  nodeEnv: string;
  database: DatabaseConfig;
  grpc: GrpcConfig;
  kafka: KafkaConfig;
}

export default (): AppConfiguration => ({
  port: parseInt(process.env.PORT || '50052', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    name: process.env.DB_NAME || 'sprints_db',
    ssl: process.env.DB_SSLMODE === 'require',
    poolMax: parseInt(process.env.DB_POOL_MAX || '20', 10),
    retryAttempts: parseInt(process.env.DB_RETRY_ATTEMPTS || '10', 10),
    retryDelayMs: parseInt(process.env.DB_RETRY_DELAY_MS || '3000', 10),
  },
  grpc: {
    host: process.env.GRPC_HOST || '0.0.0.0',
    port: parseInt(process.env.GRPC_PORT || '50052', 10),
    issuesGrpcUrl: process.env.MS1_GRPC_URL || 'localhost:50051',
  },
  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'jira-sprints-nestjs',
    groupId: process.env.KAFKA_GROUP_ID || 'jira-sprints-reply-consumer',
    queryTopic: process.env.KAFKA_TOPIC_QUERY || 'analytics.query',
    replyTopic: process.env.KAFKA_TOPIC_REPLY || 'analytics.reply',
    requestTimeoutMs: parseInt(process.env.KAFKA_REQUEST_TIMEOUT_MS || '5000', 10),
  },
});
