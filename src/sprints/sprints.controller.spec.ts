import { Test, TestingModule } from '@nestjs/testing';
import { SprintsController } from './sprints.controller';
import { SprintsService } from './sprints.service';
import { SprintEntity, SprintStatusEnum } from './entities/sprint.entity';

describe('SprintsController', () => {
  let controller: SprintsController;
  let service: SprintsService;

  const mockSprint: SprintEntity = {
    id: 'sprint-123',
    projectId: 'proj-456',
    name: 'Sprint 1',
    goal: 'Goal 1',
    status: SprintStatusEnum.PLANNED,
    startDate: 1000,
    endDate: 2000,
    totalStoryPoints: 10,
    completedStoryPoints: 0,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    getStartTimestamp: () => 1000,
    getEndTimestamp: () => 2000,
    validateDates: jest.fn(),
    start: jest.fn(),
    complete: jest.fn(),
  };

  const mockSprintsService = {
    createSprint: jest.fn().mockResolvedValue(mockSprint),
    getSprint: jest.fn().mockResolvedValue(mockSprint),
    listSprints: jest.fn().mockResolvedValue([mockSprint]),
    startSprint: jest.fn().mockResolvedValue({ ...mockSprint, status: SprintStatusEnum.ACTIVE }),
    completeSprint: jest.fn().mockResolvedValue({ ...mockSprint, status: SprintStatusEnum.COMPLETED }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SprintsController],
      providers: [
        {
          provide: SprintsService,
          useValue: mockSprintsService,
        },
      ],
    }).compile();

    controller = module.get<SprintsController>(SprintsController);
    service = module.get<SprintsService>(SprintsService);
  });

  it('should call createSprint and return proto wrapped sprint', async () => {
    const res = await controller.createSprint({ projectId: 'proj-456', name: 'Sprint 1' });
    expect(res.sprint).toBeDefined();
    expect(res.sprint.id).toBe('sprint-123');
    expect(mockSprintsService.createSprint).toHaveBeenCalledWith({ projectId: 'proj-456', name: 'Sprint 1' });
  });

  it('should call getSprint and return proto wrapped sprint', async () => {
    const res = await controller.getSprint({ id: 'sprint-123' });
    expect(res.sprint.id).toBe('sprint-123');
    expect(mockSprintsService.getSprint).toHaveBeenCalledWith('sprint-123');
  });

  it('should call listSprints and return proto wrapped sprints array', async () => {
    const res = await controller.listSprints({ projectId: 'proj-456', status: 1 });
    expect(res.sprints).toHaveLength(1);
    expect(res.sprints[0].id).toBe('sprint-123');
  });

  it('should call startSprint and return proto wrapped sprint', async () => {
    const res = await controller.startSprint({ id: 'sprint-123' });
    expect(res.sprint.status).toBe(2); // ACTIVE
    expect(mockSprintsService.startSprint).toHaveBeenCalledWith('sprint-123');
  });

  it('should call completeSprint and return proto wrapped sprint', async () => {
    const res = await controller.completeSprint({ id: 'sprint-123' });
    expect(res.sprint.status).toBe(3); // COMPLETED
    expect(mockSprintsService.completeSprint).toHaveBeenCalledWith('sprint-123');
  });
});
