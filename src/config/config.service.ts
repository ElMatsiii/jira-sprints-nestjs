import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import { AppConfiguration, DatabaseConfig, GrpcConfig, KafkaConfig } from './configuration';

@Injectable()
export class ConfigService {
  constructor(private readonly config: NestConfigService<AppConfiguration, true>) {}

  get port(): number {
    return this.config.get('port', { infer: true }) ?? 50052;
  }

  get nodeEnv(): string {
    return this.config.get('nodeEnv', { infer: true }) ?? 'development';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get database(): DatabaseConfig {
    return this.config.get('database', { infer: true });
  }

  get grpc(): GrpcConfig {
    return this.config.get('grpc', { infer: true });
  }

  get grpcHost(): string {
    return this.grpc?.host || '0.0.0.0';
  }

  get grpcPort(): number {
    return this.grpc?.port || 50052;
  }

  get issuesGrpcUrl(): string {
    return this.grpc?.issuesGrpcUrl || 'localhost:50051';
  }

  get kafka(): KafkaConfig {
    return this.config.get('kafka', { infer: true });
  }

  get kafkaBrokers(): string[] {
    return this.kafka?.brokers || ['localhost:9092'];
  }

  get kafkaClientId(): string {
    return this.kafka?.clientId || 'jira-sprints-nestjs';
  }

  get kafkaGroupId(): string {
    return this.kafka?.groupId || 'jira-sprints-reply-consumer';
  }

  get kafkaQueryTopic(): string {
    return this.kafka?.queryTopic || 'analytics.query';
  }

  get kafkaReplyTopic(): string {
    return this.kafka?.replyTopic || 'analytics.reply';
  }

  get kafkaRequestTimeoutMs(): number {
    return this.kafka?.requestTimeoutMs || 5000;
  }
}
