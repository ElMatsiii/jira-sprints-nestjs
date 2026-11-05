import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { firstValueFrom } from 'rxjs';
import { SprintService } from '../src/sprints/services/sprint.service';
import { SprintEntity, SprintStatusEnum } from '../src/database/entities/sprint.entity';
import { IssuesGrpcClient, IssuesClientService } from '../src/grpc/clients/issues-client.service';
import { SprintGrpcController } from '../src/sprints/controllers/sprint-grpc.controller';
import { GrpcExceptionFilter } from '../src/common/filters/grpc-exception.filter';
import { CircuitBreaker, CircuitState } from '../src/common/utils/circuit-breaker';
import {
  InvalidArgumentException,
  SprintNotFoundException,
  InvalidSprintStateException,
  ActiveSprintExistsException,
  ServiceUnavailableException,
  DomainException,
} from '../src/common/exceptions/domain.exceptions';
import { createMockRepository, MockRepository } from './mocks/repository.mock';
import { createMockIssuesClient } from './mocks/issues-client.mock';

describe('Sprint Lifecycle Adversarial Challenge Suite', () => {
  let sprintService: SprintService;
  let controller: SprintGrpcController;
  let mockRepo: MockRepository<SprintEntity>;
  let mockIssuesClient: ReturnType<typeof createMockIssuesClient>;
  let exceptionFilter: GrpcExceptionFilter;

  beforeEach(async () => {
    mockRepo = createMockRepository<SprintEntity>();
    mockIssuesClient = createMockIssuesClient();
    exceptionFilter = new GrpcExceptionFilter();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SprintGrpcController],
      providers: [
        SprintService,
        {
          provide: getRepositoryToken(SprintEntity),
          useValue: mockRepo,
        },
        {
          provide: IssuesGrpcClient,
          useValue: mockIssuesClient,
        },
      ],
    }).compile();

    sprintService = module.get<SprintService>(SprintService);
    controller = module.get<SprintGrpcController>(SprintGrpcController);
  });

  // Helper to extract gRPC error from exception filter
  const filterException = async (err: any) => {
    try {
      const obs = exceptionFilter.catch(err);
      await firstValueFrom(obs);
      throw new Error('Expected filter to throw/emit error');
    } catch (filteredErr) {
      return filteredErr as { code: number; message: string };
    }
  };

  // =========================================================================
  // Section 1: Sprint Date & Duration Boundaries
  // =========================================================================
  describe('1. Sprint Date & Duration Boundaries', () => {
    const basePayload = {
      projectId: 'proj-lifecycle-test',
      name: 'Boundary Test Sprint',
      goal: 'Empirical boundary validation',
    };

    it('1.1 should reject sprint creation when startDate === endDate with INVALID_ARGUMENT (code 3)', async () => {
      const invalidData = {
        ...basePayload,
        startDate: 1000,
        endDate: 1000,
      };

      await expect(sprintService.createSprint(invalidData)).rejects.toThrow(InvalidArgumentException);

      try {
        await sprintService.createSprint(invalidData);
        fail('Should have thrown InvalidArgumentException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(DomainException);
        expect(err.code).toBe(GrpcStatus.INVALID_ARGUMENT);
        expect(err.message).toMatch(/Start date must be before end date/i);

        const filtered = await filterException(err);
        expect(filtered.code).toBe(GrpcStatus.INVALID_ARGUMENT);
      }
    });

    it('1.2 should reject sprint creation when startDate > endDate with INVALID_ARGUMENT (code 3)', async () => {
      const invalidData = {
        ...basePayload,
        startDate: 1000,
        endDate: 500,
      };

      await expect(sprintService.createSprint(invalidData)).rejects.toThrow(InvalidArgumentException);

      try {
        await sprintService.createSprint(invalidData);
        fail('Should have thrown InvalidArgumentException');
      } catch (err: any) {
        expect(err.code).toBe(GrpcStatus.INVALID_ARGUMENT);
        expect(err.message).toMatch(/Start date must be before end date/i);

        const filtered = await filterException(err);
        expect(filtered.code).toBe(GrpcStatus.INVALID_ARGUMENT);
      }
    });

    it('1.3 should reject sprint creation when duration strictly exceeds 60 days with INVALID_ARGUMENT (code 3)', async () => {
      const start = 1000000;
      const sixtyDaysMs = 60 * 86400000;
      const overDurationData = {
        ...basePayload,
        startDate: start,
        endDate: start + sixtyDaysMs + 1, // exactly 1 millisecond over 60 days
      };

      await expect(sprintService.createSprint(overDurationData)).rejects.toThrow(InvalidArgumentException);

      try {
        await sprintService.createSprint(overDurationData);
        fail('Should have thrown InvalidArgumentException');
      } catch (err: any) {
        expect(err.code).toBe(GrpcStatus.INVALID_ARGUMENT);
        expect(err.message).toMatch(/Sprint duration cannot exceed 60 days/i);

        const filtered = await filterException(err);
        expect(filtered.code).toBe(GrpcStatus.INVALID_ARGUMENT);
      }
    });

    it('1.4 should ACCEPT sprint creation when duration is EXACTLY 60 days', async () => {
      const start = 1000000;
      const sixtyDaysMs = 60 * 86400000;
      const exactDurationData = {
        ...basePayload,
        startDate: start,
        endDate: start + sixtyDaysMs, // exactly 60 days
      };

      const result = await sprintService.createSprint(exactDurationData);

      expect(result).toBeDefined();
      expect(result.status).toBe(SprintStatusEnum.PLANNED);
      expect(Number(result.startDate)).toBe(start);
      expect(Number(result.endDate)).toBe(start + sixtyDaysMs);
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('1.5 should default to 14 days duration when endDate is omitted', async () => {
      const start = 1000000;
      const defaultDurationData = {
        ...basePayload,
        startDate: start,
      };

      const result = await sprintService.createSprint(defaultDurationData);

      expect(result).toBeDefined();
      expect(Number(result.endDate)).toBe(start + 14 * 86400000);
    });

    it('1.6 should empirically enforce boundaries directly on SprintEntity.validateDates', () => {
      const sprint = new SprintEntity();

      // Case: start === end
      sprint.startDate = 2000;
      sprint.endDate = 2000;
      expect(() => sprint.validateDates()).toThrow(/Start date must be before end date/);

      // Case: start > end
      sprint.startDate = 3000;
      sprint.endDate = 2000;
      expect(() => sprint.validateDates()).toThrow(/Start date must be before end date/);

      // Case: duration > 60 days
      sprint.startDate = 1000;
      sprint.endDate = 1000 + 60 * 86400000 + 10;
      expect(() => sprint.validateDates()).toThrow(/Sprint duration cannot exceed 60 days/);

      // Case: duration == 60 days (valid)
      sprint.startDate = 1000;
      sprint.endDate = 1000 + 60 * 86400000;
      expect(() => sprint.validateDates()).not.toThrow();
    });
  });

  // =========================================================================
  // Section 2: Sprint State Machine & Invariant Violations
  // =========================================================================
  describe('2. Sprint State Machine & Invariant Violations', () => {
    const createSprintEntity = (id: string, projectId: string, status: SprintStatusEnum): SprintEntity => {
      const sprint = new SprintEntity();
      sprint.id = id;
      sprint.projectId = projectId;
      sprint.name = `Sprint ${id}`;
      sprint.status = status;
      sprint.startDate = 100000;
      sprint.endDate = 100000 + 14 * 86400000;
      sprint.totalStoryPoints = 0;
      sprint.completedStoryPoints = 0;
      sprint.createdAt = new Date();
      sprint.updatedAt = new Date();
      return sprint;
    };

    it('2.1 should reject starting a sprint that is ALREADY ACTIVE with FAILED_PRECONDITION (code 9)', async () => {
      const activeSprint = createSprintEntity('sprint-already-active', 'proj-1', SprintStatusEnum.ACTIVE);
      mockRepo.findOneBy.mockResolvedValue(activeSprint);

      await expect(sprintService.startSprint('sprint-already-active')).rejects.toThrow(InvalidSprintStateException);

      try {
        await sprintService.startSprint('sprint-already-active');
        fail('Should have thrown InvalidSprintStateException');
      } catch (err: any) {
        expect(err.code).toBe(GrpcStatus.FAILED_PRECONDITION);
        expect(err.message).toMatch(/Cannot start sprint "sprint-already-active" in status "ACTIVE"/);

        const filtered = await filterException(err);
        expect(filtered.code).toBe(GrpcStatus.FAILED_PRECONDITION);
      }

      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('2.2 should reject starting a sprint when another sprint in the same project is ACTIVE (Single Active Sprint invariant)', async () => {
      const plannedSprint = createSprintEntity('sprint-to-start', 'proj-alpha', SprintStatusEnum.PLANNED);
      const existingActiveSprint = createSprintEntity('sprint-current-active', 'proj-alpha', SprintStatusEnum.ACTIVE);

      mockRepo.findOneBy.mockResolvedValue(plannedSprint);
      mockRepo.findOne.mockResolvedValue(existingActiveSprint);

      await expect(sprintService.startSprint('sprint-to-start')).rejects.toThrow(ActiveSprintExistsException);

      try {
        await sprintService.startSprint('sprint-to-start');
        fail('Should have thrown ActiveSprintExistsException');
      } catch (err: any) {
        expect(err.code).toBe(GrpcStatus.FAILED_PRECONDITION);
        expect(err.message).toContain('already has an active sprint ("sprint-current-active")');
        expect(err.message).toContain('Only one active sprint is allowed per project');

        const filtered = await filterException(err);
        expect(filtered.code).toBe(GrpcStatus.FAILED_PRECONDITION);
      }

      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('2.3 should allow starting a sprint if an active sprint belongs to a DIFFERENT project', async () => {
      const plannedSprint = createSprintEntity('sprint-proj-b', 'proj-beta', SprintStatusEnum.PLANNED);
      mockRepo.findOneBy.mockResolvedValue(plannedSprint);
      // Project beta has NO active sprint
      mockRepo.findOne.mockResolvedValue(null);
      mockIssuesClient.listIssuesBySprint.mockResolvedValue([]);

      const started = await sprintService.startSprint('sprint-proj-b');

      expect(started.status).toBe(SprintStatusEnum.ACTIVE);
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('2.4 should reject starting a COMPLETED sprint with FAILED_PRECONDITION (code 9)', async () => {
      const completedSprint = createSprintEntity('sprint-completed', 'proj-1', SprintStatusEnum.COMPLETED);
      mockRepo.findOneBy.mockResolvedValue(completedSprint);

      await expect(sprintService.startSprint('sprint-completed')).rejects.toThrow(InvalidSprintStateException);

      try {
        await sprintService.startSprint('sprint-completed');
      } catch (err: any) {
        expect(err.code).toBe(GrpcStatus.FAILED_PRECONDITION);
        expect(err.message).toContain('Cannot start sprint "sprint-completed" in status "COMPLETED"');
      }
    });

    it('2.5 should reject starting a CANCELLED sprint with FAILED_PRECONDITION (code 9)', async () => {
      const cancelledSprint = createSprintEntity('sprint-cancelled', 'proj-1', SprintStatusEnum.CANCELLED);
      mockRepo.findOneBy.mockResolvedValue(cancelledSprint);

      await expect(sprintService.startSprint('sprint-cancelled')).rejects.toThrow(InvalidSprintStateException);

      try {
        await sprintService.startSprint('sprint-cancelled');
      } catch (err: any) {
        expect(err.code).toBe(GrpcStatus.FAILED_PRECONDITION);
        expect(err.message).toContain('Cannot start sprint "sprint-cancelled" in status "CANCELLED"');
      }
    });

    it('2.6 should reject completing a PLANNED sprint with FAILED_PRECONDITION (code 9)', async () => {
      const plannedSprint = createSprintEntity('sprint-planned', 'proj-1', SprintStatusEnum.PLANNED);
      mockRepo.findOneBy.mockResolvedValue(plannedSprint);

      await expect(sprintService.completeSprint('sprint-planned')).rejects.toThrow(InvalidSprintStateException);

      try {
        await sprintService.completeSprint('sprint-planned');
      } catch (err: any) {
        expect(err.code).toBe(GrpcStatus.FAILED_PRECONDITION);
        expect(err.message).toContain('Cannot complete sprint "sprint-planned" in status "PLANNED"');
      }
    });

    it('2.7 should reject completing an already COMPLETED sprint with FAILED_PRECONDITION (code 9)', async () => {
      const completedSprint = createSprintEntity('sprint-already-completed', 'proj-1', SprintStatusEnum.COMPLETED);
      mockRepo.findOneBy.mockResolvedValue(completedSprint);

      await expect(sprintService.completeSprint('sprint-already-completed')).rejects.toThrow(InvalidSprintStateException);

      try {
        await sprintService.completeSprint('sprint-already-completed');
      } catch (err: any) {
        expect(err.code).toBe(GrpcStatus.FAILED_PRECONDITION);
        expect(err.message).toContain('Cannot complete sprint "sprint-already-completed" in status "COMPLETED"');
      }
    });

    it('2.8 should reject completing a CANCELLED sprint with FAILED_PRECONDITION (code 9)', async () => {
      const cancelledSprint = createSprintEntity('sprint-cancelled', 'proj-1', SprintStatusEnum.CANCELLED);
      mockRepo.findOneBy.mockResolvedValue(cancelledSprint);

      await expect(sprintService.completeSprint('sprint-cancelled')).rejects.toThrow(InvalidSprintStateException);

      try {
        await sprintService.completeSprint('sprint-cancelled');
      } catch (err: any) {
        expect(err.code).toBe(GrpcStatus.FAILED_PRECONDITION);
        expect(err.message).toContain('Cannot complete sprint "sprint-cancelled" in status "CANCELLED"');
      }
    });

    it('2.9 should map PostgreSQL unique index violation (code 23505) to FAILED_PRECONDITION via GrpcExceptionFilter', async () => {
      const dbError: any = new Error('duplicate key value violates unique constraint "idx_sprints_single_active_per_project"');
      dbError.code = '23505';

      const filtered = await filterException(dbError);
      expect(filtered.code).toBe(GrpcStatus.FAILED_PRECONDITION);
      expect(filtered.message).toContain('Active sprint already exists for this project');
    });
  });

  // =========================================================================
  // Section 3: Sprint Completion Issue Rollover & Resilience
  // =========================================================================
  describe('3. Sprint Completion Issue Rollover & Resilience', () => {
    const createActiveSprint = (id: string = 'sprint-active-100') => {
      const sprint = new SprintEntity();
      sprint.id = id;
      sprint.projectId = 'proj-rollover';
      sprint.name = 'Sprint with Mixed Issues';
      sprint.status = SprintStatusEnum.ACTIVE;
      sprint.totalStoryPoints = 10;
      sprint.completedStoryPoints = 0;
      sprint.startDate = 100000;
      sprint.endDate = 100000 + 14 * 86400000;
      return sprint;
    };

    it('3.1 should retain DONE issues in sprint and roll back uncompleted issues (IN_PROGRESS, TODO) to backlog', async () => {
      const activeSprint = createActiveSprint('sprint-mixed-issues');
      mockRepo.findOneBy.mockResolvedValue(activeSprint);

      // Mixed issues:
      // Issue 1: status = 4 (DONE), 5 story points
      // Issue 2: status = 2 (IN_PROGRESS), 3 story points
      // Issue 3: status = 1 (TODO), 2 story points
      const mixedIssues = [
        { id: 'issue-done-1', status: 4, storyPoints: 5, sprintId: 'sprint-mixed-issues' },
        { id: 'issue-prog-2', status: 2, storyPoints: 3, sprintId: 'sprint-mixed-issues' },
        { id: 'issue-todo-3', status: 1, storyPoints: 2, sprintId: 'sprint-mixed-issues' },
      ];
      mockIssuesClient.listIssuesBySprint.mockResolvedValue(mixedIssues);

      const result = await sprintService.completeSprint('sprint-mixed-issues');

      // Verify uncompleted issues (2 and 3) were rolled over
      expect(mockIssuesClient.removeIssuesFromSprint).toHaveBeenCalledWith(['issue-prog-2', 'issue-todo-3']);

      // Verify completed issue (issue-done-1) was NOT rolled over
      const calledIds = mockIssuesClient.removeIssuesFromSprint.mock.calls[0][0];
      expect(calledIds).not.toContain('issue-done-1');

      // Verify story points and status
      expect(result.status).toBe(SprintStatusEnum.COMPLETED);
      expect(result.totalStoryPoints).toBe(10); // 5 + 3 + 2
      expect(result.completedStoryPoints).toBe(5); // only issue-done-1
      expect(mockRepo.save).toHaveBeenCalledWith(activeSprint);
    });

    it('3.2 should verify IssuesClientService.removeIssuesFromSprint calls batchUpdateIssueSprint with empty sprintId', async () => {
      const { of } = require('rxjs');
      const mockCustomStub = {
        batchUpdateIssueSprint: jest.fn().mockReturnValue(of({ updatedCount: 2, issues: [] })),
      };

      const clientService = new IssuesClientService(undefined, mockCustomStub);
      const updatedCount = await clientService.removeIssuesFromSprint(['issue-prog-2', 'issue-todo-3']);

      expect(mockCustomStub.batchUpdateIssueSprint).toHaveBeenCalledWith({
        issueIds: ['issue-prog-2', 'issue-todo-3'],
        sprintId: '', // Empty string indicates rollover to backlog
      });
      expect(updatedCount).toBe(2);
    });

    it('3.3 should complete sprint cleanly without calling rollover when ALL issues are DONE', async () => {
      const activeSprint = createActiveSprint('sprint-all-done');
      mockRepo.findOneBy.mockResolvedValue(activeSprint);

      const allDoneIssues = [
        { id: 'issue-done-1', status: 4, storyPoints: 5 },
        { id: 'issue-done-2', status: 4, storyPoints: 8 },
      ];
      mockIssuesClient.listIssuesBySprint.mockResolvedValue(allDoneIssues);

      const result = await sprintService.completeSprint('sprint-all-done');

      expect(mockIssuesClient.removeIssuesFromSprint).not.toHaveBeenCalled();
      expect(mockIssuesClient.batchUpdateIssueSprint).not.toHaveBeenCalled();
      expect(result.status).toBe(SprintStatusEnum.COMPLETED);
      expect(result.totalStoryPoints).toBe(13);
      expect(result.completedStoryPoints).toBe(13);
    });

    it('3.4 should complete sprint cleanly with 0 points when NO issues are attached', async () => {
      const activeSprint = createActiveSprint('sprint-empty');
      mockRepo.findOneBy.mockResolvedValue(activeSprint);
      mockIssuesClient.listIssuesBySprint.mockResolvedValue([]);

      const result = await sprintService.completeSprint('sprint-empty');

      expect(mockIssuesClient.removeIssuesFromSprint).not.toHaveBeenCalled();
      expect(result.status).toBe(SprintStatusEnum.COMPLETED);
      expect(result.totalStoryPoints).toBe(10); // preserves existing or 0
      expect(result.completedStoryPoints).toBe(0);
    });

    it('3.5 should throw UNAVAILABLE (code 14) and NOT complete sprint if MS1 fails during issue listing', async () => {
      const activeSprint = createActiveSprint('sprint-ms1-down');
      mockRepo.findOneBy.mockResolvedValue(activeSprint);
      mockIssuesClient.listIssuesBySprint.mockRejectedValue(new Error('Connection to MS1 refused'));

      await expect(sprintService.completeSprint('sprint-ms1-down')).rejects.toThrow(ServiceUnavailableException);

      try {
        await sprintService.completeSprint('sprint-ms1-down');
      } catch (err: any) {
        expect(err.code).toBe(GrpcStatus.UNAVAILABLE);
        expect(err.message).toContain('Could not retrieve sprint issues from MS1');

        const filtered = await filterException(err);
        expect(filtered.code).toBe(GrpcStatus.UNAVAILABLE);
      }

      // Assert sprint remains ACTIVE and was not saved as COMPLETED
      expect(activeSprint.status).toBe(SprintStatusEnum.ACTIVE);
    });

    it('3.6 should throw UNAVAILABLE (code 14) and NOT complete sprint if MS1 fails during issue rollover', async () => {
      const activeSprint = createActiveSprint('sprint-rollover-fail');
      mockRepo.findOneBy.mockResolvedValue(activeSprint);

      const issuesWithUnfinished = [
        { id: 'issue-1', status: 4, storyPoints: 5 },
        { id: 'issue-2', status: 1, storyPoints: 3 },
      ];
      mockIssuesClient.listIssuesBySprint.mockResolvedValue(issuesWithUnfinished);
      mockIssuesClient.removeIssuesFromSprint.mockRejectedValue(new Error('gRPC DEADLINE_EXCEEDED on MS1'));

      await expect(sprintService.completeSprint('sprint-rollover-fail')).rejects.toThrow(ServiceUnavailableException);

      try {
        await sprintService.completeSprint('sprint-rollover-fail');
      } catch (err: any) {
        expect(err.code).toBe(GrpcStatus.UNAVAILABLE);
        expect(err.message).toContain('Failed to rollover unfinished issues');
      }

      // Sprint state in DB is preserved
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('3.7 should trip circuit breaker to OPEN after consecutive MS1 failures and reject calls early', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        recoveryTimeoutMs: 5000,
        callTimeoutMs: 1000,
      });

      const failingOp = jest.fn().mockRejectedValue(new Error('MS1 Down'));

      // 3 consecutive failures
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingOp)).rejects.toThrow('MS1 Down');
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // 4th call must be blocked immediately by circuit breaker without invoking failingOp
      await expect(breaker.execute(failingOp)).rejects.toThrow(/Circuit breaker is OPEN/);
      expect(failingOp).toHaveBeenCalledTimes(3);
    });
  });

  // =========================================================================
  // Section 4: Missing / Malformed Identifiers
  // =========================================================================
  describe('4. Missing & Malformed Identifiers', () => {
    it('4.1 should reject CreateSprint when projectId is missing or empty with INVALID_ARGUMENT (code 3)', async () => {
      const cases = [
        { name: 'Sprint 1' },
        { projectId: '', name: 'Sprint 1' },
        { projectId: '   ', name: 'Sprint 1' },
        { projectId: null, name: 'Sprint 1' },
      ];

      for (const input of cases) {
        await expect(sprintService.createSprint(input)).rejects.toThrow(InvalidArgumentException);

        try {
          await sprintService.createSprint(input);
        } catch (err: any) {
          expect(err.code).toBe(GrpcStatus.INVALID_ARGUMENT);
          expect(err.message).toContain('project_id is required');
        }
      }
    });

    it('4.2 should reject CreateSprint when name is missing or empty with INVALID_ARGUMENT (code 3)', async () => {
      const cases = [
        { projectId: 'proj-1' },
        { projectId: 'proj-1', name: '' },
        { projectId: 'proj-1', name: '   ' },
        { projectId: 'proj-1', name: null },
      ];

      for (const input of cases) {
        await expect(sprintService.createSprint(input)).rejects.toThrow(InvalidArgumentException);

        try {
          await sprintService.createSprint(input);
        } catch (err: any) {
          expect(err.code).toBe(GrpcStatus.INVALID_ARGUMENT);
          expect(err.message).toContain('name is required');
        }
      }
    });

    it('4.3 should reject GetSprint with empty id with INVALID_ARGUMENT (code 3)', async () => {
      for (const emptyId of ['', '   ', null as any, undefined as any]) {
        await expect(sprintService.getSprint(emptyId)).rejects.toThrow(InvalidArgumentException);

        try {
          await sprintService.getSprint(emptyId);
        } catch (err: any) {
          expect(err.code).toBe(GrpcStatus.INVALID_ARGUMENT);
          expect(err.message).toContain('sprint ID is required');
        }
      }
    });

    it('4.4 should return NOT_FOUND (code 5) when GetSprint target does not exist', async () => {
      mockRepo.findOneBy.mockResolvedValue(null);

      await expect(sprintService.getSprint('non-existent-id')).rejects.toThrow(SprintNotFoundException);

      try {
        await sprintService.getSprint('non-existent-id');
      } catch (err: any) {
        expect(err.code).toBe(GrpcStatus.NOT_FOUND);
        expect(err.message).toContain('Sprint with ID "non-existent-id" was not found');

        const filtered = await filterException(err);
        expect(filtered.code).toBe(GrpcStatus.NOT_FOUND);
      }
    });

    it('4.5 should reject StartSprint with empty id with INVALID_ARGUMENT (code 3)', async () => {
      for (const emptyId of ['', '   ']) {
        await expect(sprintService.startSprint(emptyId)).rejects.toThrow(InvalidArgumentException);
      }
    });

    it('4.6 should return NOT_FOUND (code 5) when StartSprint target does not exist', async () => {
      mockRepo.findOneBy.mockResolvedValue(null);

      await expect(sprintService.startSprint('missing-sprint')).rejects.toThrow(SprintNotFoundException);
    });

    it('4.7 should reject CompleteSprint with empty id with INVALID_ARGUMENT (code 3)', async () => {
      for (const emptyId of ['', '   ']) {
        await expect(sprintService.completeSprint(emptyId)).rejects.toThrow(InvalidArgumentException);
      }
    });

    it('4.8 should return NOT_FOUND (code 5) when CompleteSprint target does not exist', async () => {
      mockRepo.findOneBy.mockResolvedValue(null);

      await expect(sprintService.completeSprint('missing-sprint')).rejects.toThrow(SprintNotFoundException);
    });

    it('4.9 should execute GrpcController methods and bubble up domain exceptions with proper gRPC status codes', async () => {
      mockRepo.findOneBy.mockResolvedValue(null);

      await expect(controller.getSprint({ id: 'non-existent' })).rejects.toThrow(SprintNotFoundException);
      await expect(controller.createSprint({ projectId: '', name: '' })).rejects.toThrow(InvalidArgumentException);
      await expect(controller.startSprint({ id: 'non-existent' })).rejects.toThrow(SprintNotFoundException);
      await expect(controller.completeSprint({ id: 'non-existent' })).rejects.toThrow(SprintNotFoundException);
    });
  });
});
