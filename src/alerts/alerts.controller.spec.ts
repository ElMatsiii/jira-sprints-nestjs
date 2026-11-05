import { Test, TestingModule } from '@nestjs/testing';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

describe('AlertsController', () => {
  let controller: AlertsController;
  let service: AlertsService;

  const mockAlertsService = {
    triggerSprintAlert: jest.fn().mockResolvedValue({
      acknowledged: true,
      alertId: 'alert-123',
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlertsController],
      providers: [
        {
          provide: AlertsService,
          useValue: mockAlertsService,
        },
      ],
    }).compile();

    controller = module.get<AlertsController>(AlertsController);
    service = module.get<AlertsService>(AlertsService);
  });

  it('should call triggerSprintAlert and return response', async () => {
    const res = await controller.triggerSprintAlert({
      sprintId: 'sprint-1',
      type: 1,
      severity: 2,
    });

    expect(res.acknowledged).toBe(true);
    expect(res.alertId).toBe('alert-123');
    expect(mockAlertsService.triggerSprintAlert).toHaveBeenCalledWith({
      sprintId: 'sprint-1',
      type: 1,
      severity: 2,
    });
  });

  it('should support triggerAlert alias method', async () => {
    const res = await controller.triggerAlert({
      sprintId: 'sprint-2',
      type: 2,
    });

    expect(res.acknowledged).toBe(true);
    expect(mockAlertsService.triggerSprintAlert).toHaveBeenCalledWith({
      sprintId: 'sprint-2',
      type: 2,
    });
  });
});
