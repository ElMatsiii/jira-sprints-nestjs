import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { GrpcExceptionFilter } from './common/filters/grpc-exception.filter';
import { resolveProtoPath } from './common/proto/proto-path.resolver';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const grpcHost = process.env.GRPC_HOST || '0.0.0.0';
  const grpcPort = parseInt(process.env.GRPC_PORT || process.env.PORT || '50052', 10);
  const protoPath = resolveProtoPath('sprints.proto');

  logger.log(`Resolved sprints.proto path: ${protoPath}`);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: 'jira.sprints.v1',
      protoPath: protoPath,
      url: `${grpcHost}:${grpcPort}`,
      loader: {
        keepCase: false,
        longs: Number,
        enums: Number,
        defaults: true,
        oneofs: true,
      },
    },
  });

  app.useGlobalFilters(new GrpcExceptionFilter());

  await app.listen();
  logger.log(`MS2 jira-sprints-nestjs gRPC Server is listening on ${grpcHost}:${grpcPort}`);
}

bootstrap().catch((err) => {
  const logger = new Logger('BootstrapError');
  logger.error('Failed to start jira-sprints-nestjs microservice', err);
  process.exit(1);
});
