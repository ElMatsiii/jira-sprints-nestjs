import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { SprintsModule } from './sprints/sprints.module';
import { AlertsModule } from './alerts/alerts.module';
import { IssuesClientModule } from './grpc/issues-client.module';
import { KafkaModule } from './kafka/kafka.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    SprintsModule,
    AlertsModule,
    IssuesClientModule,
    KafkaModule,
  ],
})
export class AppModule {}
