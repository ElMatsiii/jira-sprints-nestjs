import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { v4 as uuidv4 } from 'uuid';
import { SprintEntity, SprintStatusEnum } from '../entities/sprint.entity';
import { ISprintRepository } from '../repositories/sprint.repository.interface';
import { IIssuesClient } from '../../grpc/interfaces/issues-client.interface';
import { IssuesGrpcClient } from '../../grpc/clients/issues-client.service';
import { SprintStatus, IssueStatus } from 'jira-contracts/gen/ts';
import {
  SprintNotFoundException,
  ActiveSprintExistsException,
  InvalidSprintStateException,
  InvalidArgumentException,
  ServiceUnavailableException,
} from '../../common/exceptions/domain.exceptions';

@Injectable()
export class SprintService {
  private readonly logger = new Logger(SprintService.name);
  private readonly repo: any;
  private readonly client: any;

  constructor(
    @Optional()
    @Inject(getRepositoryToken(SprintEntity))
    repoToken?: any,
    @Optional()
    @Inject('ISprintRepository')
    repoInterface?: any,
    @Optional()
    @Inject(IssuesGrpcClient)
    clientClass?: any,
    @Optional()
    @Inject('IIssuesClient')
    clientInterface?: any,
  ) {
    this.repo = repoToken || repoInterface;
    this.client = clientClass || clientInterface;
  }

  async createSprint(data: any): Promise<SprintEntity> {
    const projectId = String(data?.projectId ?? data?.project_id ?? '').trim();
    const name = String(data?.name ?? '').trim();
    const goal = String(data?.goal ?? '').trim();

    if (!projectId) {
      throw new InvalidArgumentException('project_id is required');
    }
    if (!name) {
      throw new InvalidArgumentException('name is required');
    }

    const rawStart = data?.startDate ?? data?.start_date;
    const rawEnd = data?.endDate ?? data?.end_date;

    const startDate = rawStart
      ? rawStart instanceof Date
        ? rawStart.getTime()
        : Number(rawStart)
      : Date.now();

    const endDate = rawEnd
      ? rawEnd instanceof Date
        ? rawEnd.getTime()
        : Number(rawEnd)
      : startDate + 14 * 86400000;

    if (startDate >= endDate) {
      throw new InvalidArgumentException('Start date must be before end date');
    }

    const maxDurationMs = 60 * 86400000; // 60 days
    if (endDate - startDate > maxDurationMs) {
      throw new InvalidArgumentException('Sprint duration cannot exceed 60 days');
    }

    const now = Date.now();
    const entity = new SprintEntity();
    entity.id = uuidv4();
    entity.projectId = projectId;
    entity.name = name;
    entity.goal = goal;
    entity.startDate = startDate;
    entity.endDate = endDate;
    entity.status = SprintStatusEnum.PLANNED;
    entity.totalStoryPoints = 0;
    entity.completedStoryPoints = 0;
    entity.createdAt = new Date(now);
    entity.updatedAt = new Date(now);

    return await this.saveSprint(entity);
  }

  async getSprint(id: string): Promise<SprintEntity> {
    const sprintId = String(id ?? '').trim();
    if (!sprintId) {
      throw new InvalidArgumentException('sprint ID is required');
    }

    const sprint = await this.findSprintById(sprintId);
    if (!sprint) {
      throw new SprintNotFoundException(sprintId);
    }
    return sprint;
  }

  async listSprints(projectId?: string, status?: number | SprintStatusEnum): Promise<SprintEntity[]> {
    const proj = projectId ? String(projectId).trim() : undefined;

    if (this.repo?.findAll && typeof this.repo.findAll === 'function') {
      return await this.repo.findAll({ projectId: proj, status: status as any });
    }

    const where: any = {};
    if (proj) {
      where.projectId = proj;
    }
    if (status !== undefined && status !== null && status !== 0) {
      if (typeof status === 'string') {
        where.status = status;
      } else {
        const statusMap: Record<number, SprintStatusEnum> = {
          [SprintStatus.SPRINT_STATUS_PLANNED]: SprintStatusEnum.PLANNED,
          [SprintStatus.SPRINT_STATUS_ACTIVE]: SprintStatusEnum.ACTIVE,
          [SprintStatus.SPRINT_STATUS_COMPLETED]: SprintStatusEnum.COMPLETED,
          [SprintStatus.SPRINT_STATUS_CANCELLED]: SprintStatusEnum.CANCELLED,
        };
        where.status = statusMap[status] || SprintStatusEnum.PLANNED;
      }
    }

    if (typeof this.repo?.find === 'function') {
      return await this.repo.find({
        where,
        order: { startDate: 'ASC' },
      });
    }

    return [];
  }

  async startSprint(id: string): Promise<SprintEntity> {
    const sprintId = String(id ?? '').trim();
    if (!sprintId) {
      throw new InvalidArgumentException('sprint ID is required');
    }

    const sprint = await this.getSprint(sprintId);

    if (sprint.status !== SprintStatusEnum.PLANNED && (sprint.status as any) !== SprintStatus.SPRINT_STATUS_PLANNED) {
      throw new InvalidSprintStateException(
        `Cannot start sprint "${sprintId}" in status "${sprint.status}"`,
      );
    }

    // Check single active sprint invariant in project
    const activeSprint = await this.findActiveSprintInProject(sprint.projectId);
    if (activeSprint && activeSprint.id !== sprint.id) {
      throw new ActiveSprintExistsException(sprint.projectId, activeSprint.id);
    }

    // Query MS1 for attached issues
    let issues: any[] = [];
    if (this.client) {
      try {
        issues = (await this.client.listIssuesBySprint(sprint.id)) || [];
      } catch (err: any) {
        this.logger.error(`Failed to list issues from MS1 for sprint start: ${err.message}`);
        throw new ServiceUnavailableException(`Could not validate issues with MS1: ${err.message}`);
      }
    }

    const totalPoints = issues.reduce(
      (sum, item) => sum + Math.max(0, Number(item.storyPoints || item.story_points || 0)),
      0,
    );

    if (issues.length === 0) {
      this.logger.warn(`Sprint "${sprint.id}" started with 0 attached issues`);
    }

    if (typeof sprint.start === 'function') {
      try {
        sprint.start();
      } catch (err: any) {
        throw new InvalidSprintStateException(err.message);
      }
    } else {
      sprint.status = SprintStatusEnum.ACTIVE;
    }

    sprint.totalStoryPoints = totalPoints;
    sprint.updatedAt = new Date();

    return await this.saveSprint(sprint);
  }

  async completeSprint(id: string): Promise<SprintEntity> {
    const sprintId = String(id ?? '').trim();
    if (!sprintId) {
      throw new InvalidArgumentException('sprint ID is required');
    }

    const sprint = await this.getSprint(sprintId);

    if (sprint.status !== SprintStatusEnum.ACTIVE && (sprint.status as any) !== SprintStatus.SPRINT_STATUS_ACTIVE) {
      throw new InvalidSprintStateException(
        `Cannot complete sprint "${sprintId}" in status "${sprint.status}"`,
      );
    }

    // Query MS1 for attached issues
    let issues: any[] = [];
    if (this.client) {
      try {
        issues = (await this.client.listIssuesBySprint(sprint.id)) || [];
      } catch (err: any) {
        this.logger.error(`Failed to list issues from MS1 for sprint complete: ${err.message}`);
        throw new ServiceUnavailableException(`Could not retrieve sprint issues from MS1: ${err.message}`);
      }
    }

    const isDone = (item: any) => {
      const s = item.status;
      return s === IssueStatus.ISSUE_STATUS_DONE || s === 4 || s === 'DONE';
    };

    const doneIssues = issues.filter(isDone);
    const completedPoints = doneIssues.reduce(
      (sum, item) => sum + Math.max(0, Number(item.storyPoints || item.story_points || 0)),
      0,
    );
    const totalPoints = issues.reduce(
      (sum, item) => sum + Math.max(0, Number(item.storyPoints || item.story_points || 0)),
      0,
    );

    const unfinishedIssues = issues.filter((i) => !isDone(i));
    if (unfinishedIssues.length > 0 && this.client) {
      const unfinishedIds = unfinishedIssues.map((i) => i.id);
      this.logger.log(`Rolling over ${unfinishedIds.length} unfinished issues back to backlog for sprint ${sprint.id}`);
      try {
        if (typeof this.client.removeIssuesFromSprint === 'function') {
          await this.client.removeIssuesFromSprint(unfinishedIds);
        } else if (typeof this.client.batchUpdateIssueSprint === 'function') {
          await this.client.batchUpdateIssueSprint(unfinishedIds, '');
        }
      } catch (err: any) {
        this.logger.error(`Failed to rollover unfinished issues via MS1: ${err.message}`);
        throw new ServiceUnavailableException(`Failed to rollover unfinished issues: ${err.message}`);
      }
    }

    if (typeof sprint.complete === 'function') {
      try {
        sprint.complete(totalPoints || sprint.totalStoryPoints, completedPoints);
      } catch (err: any) {
        throw new InvalidSprintStateException(err.message);
      }
    } else {
      sprint.status = SprintStatusEnum.COMPLETED;
      sprint.totalStoryPoints = totalPoints || sprint.totalStoryPoints;
      sprint.completedStoryPoints = completedPoints;
    }

    sprint.updatedAt = new Date();

    return await this.saveSprint(sprint);
  }

  private async findSprintById(id: string): Promise<SprintEntity | null> {
    if (!this.repo) return null;
    if (typeof this.repo.findOneBy === 'function') {
      return await this.repo.findOneBy({ id });
    }
    if (typeof this.repo.findById === 'function') {
      return await this.repo.findById(id);
    }
    if (typeof this.repo.findOne === 'function') {
      return await this.repo.findOne({ where: { id } });
    }
    return null;
  }

  private async findActiveSprintInProject(projectId: string): Promise<SprintEntity | null> {
    if (!this.repo) return null;
    if (typeof this.repo.findOne === 'function') {
      return await this.repo.findOne({
        where: {
          projectId,
          status: SprintStatusEnum.ACTIVE,
        },
      });
    }
    if (typeof this.repo.findActiveByProject === 'function') {
      return await this.repo.findActiveByProject(projectId);
    }
    return null;
  }

  private async saveSprint(sprint: SprintEntity): Promise<SprintEntity> {
    if (!this.repo) return sprint;
    if (typeof this.repo.save === 'function') {
      return await this.repo.save(sprint);
    }
    if (typeof this.repo.update === 'function') {
      return await this.repo.update(sprint);
    }
    if (typeof this.repo.create === 'function') {
      return await this.repo.create(sprint);
    }
    return sprint;
  }
}

/**
 * Direct alias for SprintsService expected by tests or DI
 */
@Injectable()
export class SprintsService extends SprintService {}
