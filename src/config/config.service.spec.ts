import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ConfigService } from './config.service';
import configuration from './configuration';

describe('ConfigService', () => {
  let service: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        NestConfigModule.forRoot({
          load: [configuration],
        }),
      ],
      providers: [ConfigService],
    }).compile();

    service = module.get<ConfigService>(ConfigService);
  });

  it('should read default port and nodeEnv', () => {
    expect(service.port).toBeDefined();
    expect(service.nodeEnv).toBeDefined();
    expect(typeof service.isProduction).toBe('boolean');
  });

  it('should read database config', () => {
    const db = service.database;
    expect(db.host).toBeDefined();
    expect(db.port).toBe(5432);
    expect(db.name).toBe('sprints_db');
  });

  it('should read grpc config', () => {
    expect(service.grpcHost).toBe('0.0.0.0');
    expect(service.grpcPort).toBe(50052);
    expect(service.issuesGrpcUrl).toBeDefined();
  });

  it('should read kafka config', () => {
    expect(Array.isArray(service.kafkaBrokers)).toBe(true);
    expect(service.kafkaClientId).toBe('jira-sprints-nestjs');
    expect(service.kafkaGroupId).toBe('jira-sprints-reply-consumer');
    expect(service.kafkaQueryTopic).toBe('analytics.query');
    expect(service.kafkaReplyTopic).toBe('analytics.reply');
    expect(service.kafkaRequestTimeoutMs).toBe(5000);
  });
});
