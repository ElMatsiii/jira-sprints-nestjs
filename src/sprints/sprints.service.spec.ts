import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';
import { SprintsService } from './sprints.service';
import { SprintEntity, SprintStatusEnum } from './entities/sprint.entity';
import { IssuesGrpcClient } from '../grpc/issues-grpc.client';
import { createMockRepository, MockRepository } from '../../test/mocks/repository.mock';
import { createMockIssuesClient } from '../../test/mocks/issues-client.mock';

describe('SprintsService', () => {
  let service: SprintsService;
  let sprintRepo: MockRepository<SprintEntity>;
  let issuesClient: ReturnType<typeof createMockIssuesClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SprintsService,
        {
          provide: getRepositoryToken(SprintEntity),
          useValue: createMockRepository<SprintEntity>(),
        },
        {
          provide: IssuesGrpcClient,
          useValue: createMockIssuesClient(),
        },
      ],
    }).compile();

    service = module.get<SprintsService>(SprintsService);
    sprintRepo = module.get(getRepositoryToken(SprintEntity));
    issuesClient = module.get(IssuesGrpcClient);
  });

  describe('createSprint', () => {
    it('should create and persist a sprint with PLANNED status', async () => {
      const now = Date.now();
      const input = {
        projectId: '11111111-1111-1111-1111-111111111111',
        name: 'Sprint Alpha',
        goal: 'Deliver MVP',
        startDate: new Date(now),
        endDate: new Date(now + 86400000 * 14),
      };

      const result = await service.createSprint(input);
      expect(sprintRepo.save).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(result.status).toBe(SprintStatusEnum.PLANNED);
    });

    it('should throw INVALID_ARGUMENT if startDate is after endDate', async () => {
      const input = {
        projectId: 'proj-1',
        name: 'Invalid Sprint',
        goal: 'Error',
        startDate: new Date('2026-12-01'),
        endDate: new Date('2026-11-01'),
      };

      await expect(service.createSprint(input)).rejects.toThrow(RpcException);
    });

    it('should throw INVALID_ARGUMENT if projectId or name is missing', async () => {
      await expect(service.createSprint({ name: 'Only Name' })).rejects.toThrow(RpcException);
      await expect(service.createSprint({ projectId: 'Only Proj' })).rejects.toThrow(RpcException);
    });

    it('should throw INVALID_ARGUMENT if sprint duration exceeds 60 days', async () => {
      const now = Date.now();
      const input = {
        projectId: 'proj-1',
        name: 'Too Long',
        startDate: now,
        endDate: now + 70 * 86400000,
      };

      await expect(service.createSprint(input)).rejects.toThrow(RpcException);
    });
  });

  describe('getSprint', () => {
    it('should return sprint when it exists', async () => {
      const mockSprint = {
        id: 'sprint-1',
        projectId: 'proj-1',
        name: 'Sprint 1',
        status: SprintStatusEnum.PLANNED,
      };
      sprintRepo.findOneBy.mockResolvedValue(mockSprint);

      const result = await service.getSprint('sprint-1');
      expect(result).toEqual(mockSprint);
    });

    it('should throw NOT_FOUND when sprint does not exist', async () => {
      sprintRepo.findOneBy.mockResolvedValue(null);

      await expect(service.getSprint('unknown-id')).rejects.toThrow(RpcException);
    });

    it('should throw INVALID_ARGUMENT when sprintId is empty', async () => {
      await expect(service.getSprint('')).rejects.toThrow(RpcException);
    });
  });

  describe('listSprints', () => {
    it('should return list of sprints filtered by project and status', async () => {
      const mockSprints = [
        { id: 's-1', projectId: 'p-1', status: SprintStatusEnum.ACTIVE },
      ];
      sprintRepo.find.mockResolvedValue(mockSprints);

      const result = await service.listSprints('p-1', SprintStatusEnum.ACTIVE);
      expect(result).toEqual(mockSprints);
      expect(sprintRepo.find).toHaveBeenCalledWith({
        where: { projectId: 'p-1', status: SprintStatusEnum.ACTIVE },
        order: { startDate: 'ASC' },
      });
    });
  });

  describe('startSprint', () => {
    it('should start sprint if PLANNED and no other sprint is ACTIVE in project', async () => {
      const sprintToStart = {
        id: 'sprint-1',
        projectId: 'proj-1',
        status: SprintStatusEnum.PLANNED,
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000 * 14),
        start: jest.fn(),
      };

      sprintRepo.findOneBy.mockResolvedValue(sprintToStart);
      sprintRepo.findOne.mockResolvedValue(null);

      const result = await service.startSprint('sprint-1');
      expect(sprintToStart.start).toHaveBeenCalled();
      expect(sprintRepo.save).toHaveBeenCalledWith(sprintToStart);
    });

    it('should throw FAILED_PRECONDITION if another sprint is already ACTIVE in project', async () => {
      const sprintToStart = {
        id: 'sprint-2',
        projectId: 'proj-1',
        status: SprintStatusEnum.PLANNED,
      };
      const existingActiveSprint = {
        id: 'sprint-1',
        projectId: 'proj-1',
        status: SprintStatusEnum.ACTIVE,
      };

      sprintRepo.findOneBy.mockResolvedValue(sprintToStart);
      sprintRepo.findOne.mockResolvedValue(existingActiveSprint);

      await expect(service.startSprint('sprint-2')).rejects.toThrow(RpcException);
      expect(sprintRepo.save).not.toHaveBeenCalled();
    });

    it('should throw FAILED_PRECONDITION if sprint is already ACTIVE or COMPLETED', async () => {
      const activeSprint = {
        id: 'sprint-active',
        projectId: 'proj-1',
        status: SprintStatusEnum.ACTIVE,
      };
      sprintRepo.findOneBy.mockResolvedValue(activeSprint);

      await expect(service.startSprint('sprint-active')).rejects.toThrow(RpcException);
    });

    it('should throw UNAVAILABLE if MS1 fails during issue query', async () => {
      const sprint = {
        id: 'sprint-1',
        projectId: 'proj-1',
        status: SprintStatusEnum.PLANNED,
      };
      sprintRepo.findOneBy.mockResolvedValue(sprint);
      sprintRepo.findOne.mockResolvedValue(null);
      issuesClient.listIssuesBySprint.mockRejectedValue(new Error('Connection refused'));

      await expect(service.startSprint('sprint-1')).rejects.toThrow(RpcException);
    });
  });

  describe('completeSprint', () => {
    it('should complete ACTIVE sprint, rollover unfinished issues, and compute story points', async () => {
      const activeSprint = {
        id: 'sprint-1',
        projectId: 'proj-1',
        status: SprintStatusEnum.ACTIVE,
        complete: jest.fn(),
      };
      sprintRepo.findOneBy.mockResolvedValue(activeSprint);

      issuesClient.listIssuesBySprint.mockResolvedValue([
        { id: 'issue-1', status: 4, storyPoints: 5 },
        { id: 'issue-2', status: 2, storyPoints: 3 },
      ]);

      const result = await service.completeSprint('sprint-1');

      expect(issuesClient.removeIssuesFromSprint).toHaveBeenCalledWith(['issue-2']);
      expect(activeSprint.complete).toHaveBeenCalledWith(8, 5);
      expect(sprintRepo.save).toHaveBeenCalledWith(activeSprint);
    });

    it('should throw FAILED_PRECONDITION when trying to complete a PLANNED sprint', async () => {
      const plannedSprint = {
        id: 'sprint-1',
        status: SprintStatusEnum.PLANNED,
      };
      sprintRepo.findOneBy.mockResolvedValue(plannedSprint);

      await expect(service.completeSprint('sprint-1')).rejects.toThrow(RpcException);
    });

    it('should throw UNAVAILABLE if MS1 fails during complete issue retrieval', async () => {
      const activeSprint = {
        id: 'sprint-1',
        projectId: 'proj-1',
        status: SprintStatusEnum.ACTIVE,
      };
      sprintRepo.findOneBy.mockResolvedValue(activeSprint);
      issuesClient.listIssuesBySprint.mockRejectedValue(new Error('Timeout'));

      await expect(service.completeSprint('sprint-1')).rejects.toThrow(RpcException);
    });
  });
});
