import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '../config/config.service';
import { SprintEntity } from './entities/sprint.entity';
import { SprintAlertEntity } from './entities/sprint-alert.entity';
import { SprintIssueEntity } from './entities/sprint-issue.entity';
import { DatabaseMigrationService } from './database-migration.service';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const db = config.database;
        return {
          type: 'postgres',
          host: db.host,
          port: db.port,
          username: db.user,
          password: db.password,
          database: db.name,
          ssl: db.ssl ? { rejectUnauthorized: false } : false,
          entities: [SprintEntity, SprintAlertEntity, SprintIssueEntity],
          synchronize: false, // We use migrations
          retryAttempts: db.retryAttempts,
          retryDelay: db.retryDelayMs,
          extra: {
            max: db.poolMax,
          },
        };
      },
    }),
    TypeOrmModule.forFeature([SprintEntity, SprintAlertEntity, SprintIssueEntity]),
  ],
  providers: [DatabaseMigrationService],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
