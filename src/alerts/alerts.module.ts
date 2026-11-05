import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SprintAlertEntity } from '../database/entities/sprint-alert.entity';
import { AlertRepository } from './repositories/alert.repository';
import { AlertService, AlertsService } from './services/alert.service';
import { AlertGrpcController, AlertsController } from './controllers/alert-grpc.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SprintAlertEntity])],
  controllers: [AlertGrpcController, AlertsController],
  providers: [
    AlertRepository,
    {
      provide: 'IAlertRepository',
      useClass: AlertRepository,
    },
    AlertService,
    AlertsService,
  ],
  exports: [AlertService, AlertsService, AlertRepository, 'IAlertRepository'],
})
export class AlertsModule {}
