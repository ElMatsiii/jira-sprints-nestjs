import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';
import { AlertsService } from './alerts.service';
import { AlertEntity } from './entities/alert.entity';
import { createMockRepository, MockRepository } from '../../test/mocks/repository.mock';

describe('AlertsService', () => {
  let service: AlertsService;
  let alertRepo: MockRepository<AlertEntity>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertsService,
        {
          provide: getRepositoryToken(AlertEntity),
          useValue: createMockRepository<AlertEntity>(),
        },
      ],
    }).compile();

    service = module.get<AlertsService>(AlertsService);
    alertRepo = module.get(getRepositoryToken(AlertEntity));
  });

  it('should accept valid SCOPE_CREEP alert and return ACK with alert ID', async () => {
    const request = {
      sprintId: '11111111-1111-1111-1111-111111111111',
      type: 1, // ALERT_TYPE_SCOPE_CREEP
      severity: 2, // ALERT_SEVERITY_WARNING
      message: 'Scope increased by 15 points after sprint start',
      recommendation: 'Re-estimate capacity with product owner',
    };

    alertRepo.save.mockResolvedValue({ id: 'alert-uuid-99', ...request });

    const response = await service.triggerSprintAlert(request);
    expect(response.acknowledged).toBe(true);
    expect(response.alertId).toBe('alert-uuid-99');
    expect(alertRepo.save).toHaveBeenCalled();
  });

  it('should throw INVALID_ARGUMENT when alert type is unspecified (0)', async () => {
    const invalidRequest = {
      sprintId: 'sprint-1',
      type: 0, // UNSPECIFIED
      severity: 2,
      message: 'Invalid type',
      recommendation: '',
    };

    await expect(service.triggerSprintAlert(invalidRequest)).rejects.toThrow(RpcException);
    expect(alertRepo.save).not.toHaveBeenCalled();
  });

  it('should throw INVALID_ARGUMENT when sprintId is missing', async () => {
    const invalidRequest = {
      sprintId: '',
      type: 1,
      severity: 2,
      message: 'Missing sprint',
      recommendation: '',
    };

    await expect(service.triggerSprintAlert(invalidRequest)).rejects.toThrow(RpcException);
  });

  it('should fallback to default message if message is empty', async () => {
    const request = {
      sprintId: 'sprint-1',
      type: 2, // VELOCITY_DEFICIT
      severity: 1,
    };

    alertRepo.save.mockImplementation(async (entity) => ({ ...entity, id: 'alert-def' }));

    const res = await service.triggerSprintAlert(request);
    expect(res.acknowledged).toBe(true);
    expect(res.alertId).toBe('alert-def');
  });
});
