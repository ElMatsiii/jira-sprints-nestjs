import { Controller, Inject, Optional } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AlertService, AlertsService } from '../services/alert.service';
import { TriggerSprintAlertRequest, TriggerSprintAlertResponse } from 'jira-contracts/gen/ts';

@Controller()
export class AlertGrpcController {
  private readonly alertService: AlertService;

  constructor(
    @Optional() @Inject(AlertService) alertService?: AlertService,
    @Optional() @Inject(AlertsService) alertsService?: AlertsService,
  ) {
    this.alertService = alertService || alertsService || (alertService as any);
  }

  @GrpcMethod('AlertService', 'TriggerSprintAlert')
  async triggerSprintAlert(data: TriggerSprintAlertRequest | any): Promise<TriggerSprintAlertResponse | any> {
    return await this.alertService.triggerSprintAlert(data);
  }

  @GrpcMethod('AlertService', 'TriggerAlert')
  async triggerAlert(data: any): Promise<TriggerSprintAlertResponse | any> {
    return await this.alertService.triggerSprintAlert(data);
  }
}

/**
 * Direct alias for AlertsController expected by tests or module wiring
 */
@Controller()
export class AlertsController extends AlertGrpcController {}
