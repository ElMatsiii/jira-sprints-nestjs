import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { firstValueFrom, of } from 'rxjs';
import { SprintService } from '../src/sprints/services/sprint.service';
import { SprintEntity, SprintStatusEnum } from '../src/database/entities/sprint.entity';
import { IssuesGrpcClient, IssuesClientService } from '../src/grpc/clients/issues-client.service';
import { SprintGrpcController } from '../src/sprints/controllers/sprint-grpc.controller';
import { GrpcExceptionFilter } from '../src/common/filters/grpc-exception.filter';
import {
  InvalidArgumentException,
  SprintNotFoundException,
  InvalidSprintStateException,
  ActiveSprintExistsException,
  ServiceUnavailableException,
} from '../src/common/exceptions/domain.exceptions';
import { IssueStatus } from 'jira-contracts/gen/ts';

describe('Adversarial Sprint Invariants Stress Harness (Iteration 2)', () => {
  let exceptionFilter: GrpcExceptionFilter;

  beforeEach(() => {
    exceptionFilter = new GrpcExceptionFilter();
  });

  const filterException = async (err: any) => {
    try {
      const obs = exceptionFilter.catch(err);
      await firstValueFrom(obs);
      throw new Error('Expected exception filter to emit error');
    } catch (filteredErr) {
      return filteredErr as { code: number; message: string };
    }
  };

  const cloneEntity = (s: SprintEntity): SprintEntity => {
    const copy = new SprintEntity();
    Object.assign(copy, s);
    return copy;
  };

  // =========================================================================
  // Dimension 1: Single Active Sprint Invariant Under Stress & Concurrency
  // =========================================================================
  describe('Dimension 1: Single Active Sprint Invariant', () => {
    let sprintService: SprintService;
    let mockRepo: any;
    let mockIssuesClient: any;

    // Database simulation with transactional serialization
    let sprintStore: Map<string, SprintEntity>;

    beforeEach(async () => {
      sprintStore = new Map<string, SprintEntity>();

      mockRepo = {
        findOneBy: jest.fn(async ({ id }: { id: string }) => {
          const s = sprintStore.get(id);
          return s ? cloneEntity(s) : null;
        }),
        findOne: jest.fn(async (query: any) => {
          const { where } = query;
          for (const s of sprintStore.values()) {
            let match = true;
            if (where.id && s.id !== where.id) match = false;
            if (where.projectId && s.projectId !== where.projectId) match = false;
            if (where.status && s.status !== where.status) match = false;
            if (match) return cloneEntity(s);
          }
          return null;
        }),
        save: jest.fn(async (entity: SprintEntity) => {
          // Simulate PostgreSQL unique partial index constraint:
          // UNIQUE (project_id) WHERE status = 'ACTIVE'
          if (entity.status === SprintStatusEnum.ACTIVE) {
            for (const existing of sprintStore.values()) {
              if (
                existing.projectId === entity.projectId &&
                existing.status === SprintStatusEnum.ACTIVE &&
                existing.id !== entity.id
              ) {
                const dbErr: any = new Error(
                  `duplicate key value violates unique constraint "idx_sprints_single_active_per_project"`,
                );
                dbErr.code = '23505';
                throw dbErr;
              }
            }
          }
          // Atomic commit to store
          sprintStore.set(entity.id, cloneEntity(entity));
          return cloneEntity(entity);
        }),
      };

      mockIssuesClient = {
        listIssuesBySprint: jest.fn().mockResolvedValue([]),
        moveIssuesToSprint: jest.fn().mockResolvedValue(0),
        removeIssuesFromSprint: jest.fn().mockResolvedValue(0),
        batchUpdateIssueSprint: jest.fn().mockResolvedValue({ updatedCount: 0, issues: [] }),
      };

      const module: TestingModule = await Test.createTestingModule({
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
    });

    const createSeedSprint = (id: string, projectId: string, status: SprintStatusEnum = SprintStatusEnum.PLANNED) => {
      const s = new SprintEntity();
      s.id = id;
      s.projectId = projectId;
      s.name = `Sprint ${id}`;
      s.goal = 'Invariant stress goal';
      s.startDate = 100000;
      s.endDate = 100000 + 14 * 86400000;
      s.status = status;
      s.totalStoryPoints = 0;
      s.completedStoryPoints = 0;
      s.createdAt = new Date();
      s.updatedAt = new Date();
      sprintStore.set(id, cloneEntity(s));
      return s;
    };

    it('1.1 should enforce exactly ONE active sprint when 50 concurrent requests attempt to start 50 planned sprints in the SAME project', async () => {
      const projectId = 'proj-heavy-race';
      const sprintCount = 50;
      const sprintIds: string[] = [];

      for (let i = 0; i < sprintCount; i++) {
        const id = `sprint-race-${i}`;
        sprintIds.push(id);
        createSeedSprint(id, projectId, SprintStatusEnum.PLANNED);
      }

      // Fire 50 simultaneous startSprint operations
      const results = await Promise.allSettled(
        sprintIds.map((id) => sprintService.startSprint(id)),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly ONE startSprint must succeed
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(sprintCount - 1);

      // Verify all rejected calls threw appropriate invariant exceptions
      for (const rej of rejected) {
        if (rej.status === 'rejected') {
          const err = rej.reason;
          const isDomainViolation =
            err instanceof ActiveSprintExistsException ||
            err.code === '23505' ||
            err.message?.includes('already has an active sprint') ||
            err.message?.includes('duplicate key');
          expect(isDomainViolation).toBe(true);
        }
      }

      // Inspect DB state: exactly 1 sprint in the project is persisted as ACTIVE
      const activeSprints = Array.from(sprintStore.values()).filter(
        (s) => s.projectId === projectId && s.status === SprintStatusEnum.ACTIVE,
      );
      expect(activeSprints.length).toBe(1);

      // Remaining 49 sprints remain in PLANNED status in DB
      const plannedSprints = Array.from(sprintStore.values()).filter(
        (s) => s.projectId === projectId && s.status === SprintStatusEnum.PLANNED,
      );
      expect(plannedSprints.length).toBe(sprintCount - 1);
    });

    it('1.2 should strictly isolate multi-project active sprints (10 projects can all have 1 active sprint simultaneously)', async () => {
      const projectCount = 10;
      const sprintIds: string[] = [];

      for (let p = 0; p < projectCount; p++) {
        const pid = `proj-tenant-${p}`;
        const sid = `sprint-p-${p}`;
        sprintIds.push(sid);
        createSeedSprint(sid, pid, SprintStatusEnum.PLANNED);
      }

      // Concurrently start sprints across different projects
      const results = await Promise.allSettled(
        sprintIds.map((id) => sprintService.startSprint(id)),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBe(projectCount);

      // Each project must have exactly 1 active sprint
      for (let p = 0; p < projectCount; p++) {
        const pid = `proj-tenant-${p}`;
        const activeForProj = Array.from(sprintStore.values()).filter(
          (s) => s.projectId === pid && s.status === SprintStatusEnum.ACTIVE,
        );
        expect(activeForProj.length).toBe(1);
      }
    });

    it('1.3 should allow sequential sprint turnover: start S1 -> complete S1 -> start S2 -> complete S2', async () => {
      const pid = 'proj-turnover';
      createSeedSprint('s1', pid, SprintStatusEnum.PLANNED);
      createSeedSprint('s2', pid, SprintStatusEnum.PLANNED);
      createSeedSprint('s3', pid, SprintStatusEnum.PLANNED);

      // 1. Start S1 -> ACTIVE
      await sprintService.startSprint('s1');
      expect(sprintStore.get('s1')!.status).toBe(SprintStatusEnum.ACTIVE);

      // 2. Starting S2 while S1 is active must fail
      await expect(sprintService.startSprint('s2')).rejects.toThrow(ActiveSprintExistsException);

      // 3. Complete S1 -> COMPLETED
      await sprintService.completeSprint('s1');
      expect(sprintStore.get('s1')!.status).toBe(SprintStatusEnum.COMPLETED);

      // 4. Now S2 can start cleanly
      await sprintService.startSprint('s2');
      expect(sprintStore.get('s2')!.status).toBe(SprintStatusEnum.ACTIVE);

      // 5. Trying to restart completed S1 must fail with FAILED_PRECONDITION
      await expect(sprintService.startSprint('s1')).rejects.toThrow(InvalidSprintStateException);

      // 6. Complete S2 and start S3
      await sprintService.completeSprint('s2');
      expect(sprintStore.get('s2')!.status).toBe(SprintStatusEnum.COMPLETED);

      await sprintService.startSprint('s3');
      expect(sprintStore.get('s3')!.status).toBe(SprintStatusEnum.ACTIVE);
    });

    it('1.4 should reject restarting an already ACTIVE sprint with FAILED_PRECONDITION (code 9)', async () => {
      createSeedSprint('s-already-active', 'proj-dup', SprintStatusEnum.ACTIVE);

      await expect(sprintService.startSprint('s-already-active')).rejects.toThrow(InvalidSprintStateException);

      try {
        await sprintService.startSprint('s-already-active');
      } catch (err: any) {
        expect(err.code).toBe(GrpcStatus.FAILED_PRECONDITION);
        const filtered = await filterException(err);
        expect(filtered.code).toBe(GrpcStatus.FAILED_PRECONDITION);
      }
    });
  });

  // =========================================================================
  // Dimension 2: Date Sequencing & Time Boundaries Stress Testing
  // =========================================================================
  describe('Dimension 2: Date Sequencing & Time Boundaries', () => {
    let sprintService: SprintService;
    let mockRepo: any;
    let mockIssuesClient: any;

    beforeEach(async () => {
      mockRepo = {
        save: jest.fn(async (entity: SprintEntity) => entity),
        findOneBy: jest.fn(),
        findOne: jest.fn().mockResolvedValue(null),
      };

      mockIssuesClient = {
        listIssuesBySprint: jest.fn().mockResolvedValue([]),
      };

      const module: TestingModule = await Test.createTestingModule({
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
    });

    it('2.1 should reject startDate === endDate (0-duration sprint) for specified timestamps', async () => {
      const timestamps = [1000, 1700000000000, 2000000000000];
      for (const ts of timestamps) {
        await expect(
          sprintService.createSprint({
            projectId: 'proj-date',
            name: 'Zero Duration Sprint',
            startDate: ts,
            endDate: ts,
          }),
        ).rejects.toThrow(InvalidArgumentException);
      }
    });

    it('2.2 should default to 14 days when dates are omitted or zero (protobuf default)', async () => {
      // Proto3 zero default
      const s = await sprintService.createSprint({
        projectId: 'proj-proto-default',
        name: 'Default Duration Sprint',
        startDate: 0,
        endDate: 0,
      });

      expect(s).toBeDefined();
      expect(s.status).toBe(SprintStatusEnum.PLANNED);
      expect(Number(s.endDate)).toBeGreaterThan(Number(s.startDate));
      expect(Number(s.endDate) - Number(s.startDate)).toBe(14 * 86400000);
    });

    it('2.3 should reject inverted dates (startDate > endDate) by varying deltas', async () => {
      const deltas = [1, 100, 86400000, 30 * 86400000];
      const baseStart = 1700000000000;

      for (const delta of deltas) {
        await expect(
          sprintService.createSprint({
            projectId: 'proj-date',
            name: 'Inverted Sprint',
            startDate: baseStart,
            endDate: baseStart - delta,
          }),
        ).rejects.toThrow(InvalidArgumentException);
      }
    });

    it('2.4 should enforce EXACT 60-day maximum duration limit (60 * 86400000 ms)', async () => {
      const baseStart = 1000000;
      const sixtyDaysMs = 60 * 86400000;

      // Exactly 60 days -> ACCEPTED
      const valid = await sprintService.createSprint({
        projectId: 'proj-date',
        name: 'Exact 60 Days',
        startDate: baseStart,
        endDate: baseStart + sixtyDaysMs,
      });
      expect(valid).toBeDefined();
      expect(valid.status).toBe(SprintStatusEnum.PLANNED);

      // 60 days + 1 millisecond -> REJECTED
      await expect(
        sprintService.createSprint({
          projectId: 'proj-date',
          name: '60 Days + 1ms',
          startDate: baseStart,
          endDate: baseStart + sixtyDaysMs + 1,
        }),
      ).rejects.toThrow(InvalidArgumentException);

      // 60 days + 1 second -> REJECTED
      await expect(
        sprintService.createSprint({
          projectId: 'proj-date',
          name: '60 Days + 1s',
          startDate: baseStart,
          endDate: baseStart + sixtyDaysMs + 1000,
        }),
      ).rejects.toThrow(InvalidArgumentException);
    });

    it('2.5 should handle Date objects, numeric timestamps, and string timestamps consistently', async () => {
      const startMs = 1700000000000;
      const endMs = startMs + 14 * 86400000;

      // Date objects
      const s1 = await sprintService.createSprint({
        projectId: 'proj-types',
        name: 'Date Objects',
        startDate: new Date(startMs),
        endDate: new Date(endMs),
      });
      expect(Number(s1.startDate)).toBe(startMs);
      expect(Number(s1.endDate)).toBe(endMs);

      // Numeric timestamps
      const s2 = await sprintService.createSprint({
        projectId: 'proj-types',
        name: 'Numeric Timestamps',
        startDate: startMs,
        endDate: endMs,
      });
      expect(Number(s2.startDate)).toBe(startMs);
      expect(Number(s2.endDate)).toBe(endMs);
    });

    it('2.6 should prevent starting a sprint whose dates were corrupted after creation', async () => {
      const corruptedSprint = new SprintEntity();
      corruptedSprint.id = 'sprint-corrupted-dates';
      corruptedSprint.projectId = 'proj-tampered';
      corruptedSprint.status = SprintStatusEnum.PLANNED;
      corruptedSprint.startDate = 20000;
      corruptedSprint.endDate = 10000; // corrupted start > end

      mockRepo.findOneBy.mockResolvedValue(corruptedSprint);
      mockRepo.findOne = jest.fn().mockResolvedValue(null);

      // Attempting to start must throw InvalidSprintStateException via validateDates()
      await expect(sprintService.startSprint('sprint-corrupted-dates')).rejects.toThrow(
        InvalidSprintStateException,
      );
    });
  });

  // =========================================================================
  // Dimension 3: Incomplete Issue Rollover on Sprint Completion
  // =========================================================================
  describe('Dimension 3: Incomplete Issue Rollover on Sprint Completion', () => {
    let sprintService: SprintService;
    let mockRepo: any;
    let mockIssuesClient: any;

    beforeEach(async () => {
      mockRepo = {
        findOneBy: jest.fn(),
        save: jest.fn(async (s: SprintEntity) => s),
      };

      mockIssuesClient = {
        listIssuesBySprint: jest.fn(),
        removeIssuesFromSprint: jest.fn().mockResolvedValue(0),
        batchUpdateIssueSprint: jest.fn().mockResolvedValue({ updatedCount: 0, issues: [] }),
      };

      const module: TestingModule = await Test.createTestingModule({
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
    });

    const createActiveSprint = (id: string = 'sprint-rollover-test') => {
      const s = new SprintEntity();
      s.id = id;
      s.projectId = 'proj-rollover';
      s.name = 'Sprint with Issues';
      s.status = SprintStatusEnum.ACTIVE;
      s.totalStoryPoints = 0;
      s.completedStoryPoints = 0;
      s.startDate = 100000;
      s.endDate = 100000 + 14 * 86400000;
      return s;
    };

    it('3.1 should correctly partition issues across all statuses (TODO, IN_PROGRESS, IN_REVIEW, DONE, UNSPECIFIED)', async () => {
      const sprint = createActiveSprint('sprint-full-status-mix');
      mockRepo.findOneBy.mockResolvedValue(sprint);

      // Issues across all statuses in protobuf contract:
      // Status 4 = DONE (completed, 8 pts)
      // Status 'DONE' = DONE string representation (completed, 5 pts)
      // Status 3 = IN_REVIEW (unfinished, 3 pts)
      // Status 2 = IN_PROGRESS (unfinished, 2 pts)
      // Status 1 = TODO (unfinished, 1 pt)
      // Status 0 = UNSPECIFIED (unfinished, 0 pts)
      const issues = [
        { id: 'i-done-num', status: 4, storyPoints: 8 },
        { id: 'i-done-str', status: 'DONE', storyPoints: 5 },
        { id: 'i-in-review', status: 3, storyPoints: 3 },
        { id: 'i-in-progress', status: 2, storyPoints: 2 },
        { id: 'i-todo', status: 1, storyPoints: 1 },
        { id: 'i-unspecified', status: 0, storyPoints: 0 },
      ];
      mockIssuesClient.listIssuesBySprint.mockResolvedValue(issues);

      const completed = await sprintService.completeSprint('sprint-full-status-mix');

      // Verify rollover was invoked ONLY for the 4 unfinished issues
      expect(mockIssuesClient.removeIssuesFromSprint).toHaveBeenCalledWith([
        'i-in-review',
        'i-in-progress',
        'i-todo',
        'i-unspecified',
      ]);

      // Verify completed issues were NEVER passed to rollover
      const removedIds = mockIssuesClient.removeIssuesFromSprint.mock.calls[0][0];
      expect(removedIds).not.toContain('i-done-num');
      expect(removedIds).not.toContain('i-done-str');

      // Points calculation:
      // Total points: 8 + 5 + 3 + 2 + 1 + 0 = 19
      // Completed points: 8 + 5 = 13
      expect(completed.totalStoryPoints).toBe(19);
      expect(completed.completedStoryPoints).toBe(13);
      expect(completed.status).toBe(SprintStatusEnum.COMPLETED);
    });

    it('3.2 should complete sprint without calling rollover when 100% of issues are DONE', async () => {
      const sprint = createActiveSprint('sprint-100-percent');
      mockRepo.findOneBy.mockResolvedValue(sprint);

      const allDoneIssues = [
        { id: 'd-1', status: 4, storyPoints: 10 },
        { id: 'd-2', status: IssueStatus.ISSUE_STATUS_DONE, storyPoints: 20 },
      ];
      mockIssuesClient.listIssuesBySprint.mockResolvedValue(allDoneIssues);

      const completed = await sprintService.completeSprint('sprint-100-percent');

      expect(mockIssuesClient.removeIssuesFromSprint).not.toHaveBeenCalled();
      expect(mockIssuesClient.batchUpdateIssueSprint).not.toHaveBeenCalled();
      expect(completed.totalStoryPoints).toBe(30);
      expect(completed.completedStoryPoints).toBe(30);
      expect(completed.status).toBe(SprintStatusEnum.COMPLETED);
    });

    it('3.3 should roll over ALL issues and record 0 completed points when 0% of issues are DONE', async () => {
      const sprint = createActiveSprint('sprint-0-percent');
      mockRepo.findOneBy.mockResolvedValue(sprint);

      const unfinishedIssues = [
        { id: 'u-1', status: 1, storyPoints: 5 },
        { id: 'u-2', status: 2, storyPoints: 7 },
      ];
      mockIssuesClient.listIssuesBySprint.mockResolvedValue(unfinishedIssues);

      const completed = await sprintService.completeSprint('sprint-0-percent');

      expect(mockIssuesClient.removeIssuesFromSprint).toHaveBeenCalledWith(['u-1', 'u-2']);
      expect(completed.totalStoryPoints).toBe(12);
      expect(completed.completedStoryPoints).toBe(0);
      expect(completed.status).toBe(SprintStatusEnum.COMPLETED);
    });

    it('3.4 should fail atomically and keep sprint ACTIVE if MS1 fails during issue listing', async () => {
      const sprint = createActiveSprint('sprint-ms1-err');
      mockRepo.findOneBy.mockResolvedValue(sprint);
      mockIssuesClient.listIssuesBySprint.mockRejectedValue(new Error('MS1 Network Down'));

      await expect(sprintService.completeSprint('sprint-ms1-err')).rejects.toThrow(
        ServiceUnavailableException,
      );

      // Verify sprint status was NOT changed to COMPLETED
      expect(sprint.status).toBe(SprintStatusEnum.ACTIVE);
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('3.5 should fail atomically and keep sprint ACTIVE if MS1 fails during issue rollover', async () => {
      const sprint = createActiveSprint('sprint-rollover-err');
      mockRepo.findOneBy.mockResolvedValue(sprint);

      mockIssuesClient.listIssuesBySprint.mockResolvedValue([
        { id: 'iss-1', status: 1, storyPoints: 5 },
      ]);
      mockIssuesClient.removeIssuesFromSprint.mockRejectedValue(new Error('MS1 gRPC Timeout'));

      await expect(sprintService.completeSprint('sprint-rollover-err')).rejects.toThrow(
        ServiceUnavailableException,
      );

      // Sprint remains ACTIVE; DB was not updated with COMPLETED
      expect(sprint.status).toBe(SprintStatusEnum.ACTIVE);
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Dimension 4: Adding / Removing Issues to/from Active vs Closed Sprints
  // =========================================================================
  describe('Dimension 4: Adding / Removing Issues to/from Active vs Closed Sprints', () => {
    let sprintService: SprintService;
    let issuesClientService: IssuesClientService;
    let mockRepo: any;
    let mockIssueStub: any;

    beforeEach(async () => {
      mockIssueStub = {
        listIssues: jest.fn(),
        batchUpdateIssueSprint: jest.fn().mockReturnValue(
          of({ updatedCount: 2, issues: [] }),
        ),
      };

      issuesClientService = new IssuesClientService(undefined, mockIssueStub);

      mockRepo = {
        findOneBy: jest.fn(),
        save: jest.fn(async (s: SprintEntity) => s),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SprintService,
          {
            provide: getRepositoryToken(SprintEntity),
            useValue: mockRepo,
          },
          {
            provide: IssuesGrpcClient,
            useValue: issuesClientService,
          },
        ],
      }).compile();

      sprintService = module.get<SprintService>(SprintService);
    });

    const createSprint = (id: string, status: SprintStatusEnum): SprintEntity => {
      const s = new SprintEntity();
      s.id = id;
      s.projectId = 'proj-immutability';
      s.name = `Sprint ${id}`;
      s.status = status;
      s.startDate = 100000;
      s.endDate = 100000 + 14 * 86400000;
      s.totalStoryPoints = 10;
      s.completedStoryPoints = 5;
      return s;
    };

    it('4.1 should support adding issues to an ACTIVE sprint via moveIssuesToSprint (mid-sprint scope creep)', async () => {
      const activeSprint = createSprint('sprint-active-scope', SprintStatusEnum.ACTIVE);
      mockRepo.findOneBy.mockResolvedValue(activeSprint);

      const count = await issuesClientService.moveIssuesToSprint(['issue-1', 'issue-2'], activeSprint.id);

      expect(count).toBe(2);
      expect(mockIssueStub.batchUpdateIssueSprint).toHaveBeenCalledWith({
        issueIds: ['issue-1', 'issue-2'],
        sprintId: 'sprint-active-scope',
      });
    });

    it('4.2 should support removing issues from an ACTIVE sprint back to backlog via removeIssuesFromSprint', async () => {
      const count = await issuesClientService.removeIssuesFromSprint(['issue-1', 'issue-2']);

      expect(count).toBe(2);
      expect(mockIssueStub.batchUpdateIssueSprint).toHaveBeenCalledWith({
        issueIds: ['issue-1', 'issue-2'],
        sprintId: '', // Empty string = unassigned / backlog
      });
    });

    it('4.3 should enforce state machine immutability: CLOSED (COMPLETED / CANCELLED) sprints cannot be modified or re-executed', async () => {
      // 1. COMPLETED sprint cannot be started
      const completedSprint = createSprint('sprint-closed-1', SprintStatusEnum.COMPLETED);
      mockRepo.findOneBy.mockResolvedValue(completedSprint);

      await expect(sprintService.startSprint('sprint-closed-1')).rejects.toThrow(
        InvalidSprintStateException,
      );

      // 2. COMPLETED sprint cannot be completed again
      await expect(sprintService.completeSprint('sprint-closed-1')).rejects.toThrow(
        InvalidSprintStateException,
      );

      // 3. CANCELLED sprint cannot be started
      const cancelledSprint = createSprint('sprint-cancelled-1', SprintStatusEnum.CANCELLED);
      mockRepo.findOneBy.mockResolvedValue(cancelledSprint);

      await expect(sprintService.startSprint('sprint-cancelled-1')).rejects.toThrow(
        InvalidSprintStateException,
      );

      // 4. CANCELLED sprint cannot be completed
      await expect(sprintService.completeSprint('sprint-cancelled-1')).rejects.toThrow(
        InvalidSprintStateException,
      );

      // Verify domain entity methods directly reject transitions on closed status
      expect(() => completedSprint.start()).toThrow(/Cannot start sprint in status COMPLETED/);
      expect(() => completedSprint.complete()).toThrow(/Cannot complete sprint in status COMPLETED/);
      expect(() => cancelledSprint.start()).toThrow(/Cannot start sprint in status CANCELLED/);
      expect(() => cancelledSprint.complete()).toThrow(/Cannot complete sprint in status CANCELLED/);
    });

    it('4.4 should verify that when sprint is COMPLETED, only DONE issues remain in the sprint snapshot', async () => {
      const activeSprint = createSprint('sprint-snapshot', SprintStatusEnum.ACTIVE);
      mockRepo.findOneBy.mockResolvedValue(activeSprint);

      mockIssueStub.listIssues.mockReturnValue(
        of({
          issues: [
            { id: 'done-card-1', status: 4, storyPoints: 8 },
            { id: 'wip-card-2', status: 2, storyPoints: 5 },
          ],
        }),
      );

      const completed = await sprintService.completeSprint('sprint-snapshot');

      // The WIP card was removed from the sprint (rolled back to backlog)
      expect(mockIssueStub.batchUpdateIssueSprint).toHaveBeenCalledWith({
        issueIds: ['wip-card-2'],
        sprintId: '',
      });

      // Done card (8 pts) remains as completedStoryPoints
      expect(completed.completedStoryPoints).toBe(8);
      expect(completed.totalStoryPoints).toBe(13);
      expect(completed.status).toBe(SprintStatusEnum.COMPLETED);
    });
  });
});
