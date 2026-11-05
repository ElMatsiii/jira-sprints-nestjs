import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SprintEntity, SprintStatusEnum } from '../entities/sprint.entity';
import { ISprintRepository } from './sprint.repository.interface';
import { SprintStatus } from 'jira-contracts/gen/ts';

@Injectable()
export class SprintRepository implements ISprintRepository {
  constructor(
    @Optional()
    @InjectRepository(SprintEntity)
    private readonly repo: Repository<SprintEntity>,
  ) {}

  async create(sprint: Partial<SprintEntity>): Promise<SprintEntity> {
    const entity = this.repo.create(sprint);
    return await this.repo.save(entity);
  }

  async findById(id: string): Promise<SprintEntity | null> {
    if (typeof this.repo.findOneBy === 'function') {
      return await this.repo.findOneBy({ id });
    }
    return await this.repo.findOne({ where: { id } });
  }

  async findAll(filter?: { projectId?: string; status?: number }): Promise<SprintEntity[]> {
    const where: any = {};
    if (filter?.projectId) {
      where.projectId = filter.projectId;
    }
    if (filter?.status !== undefined && filter?.status !== null && filter.status !== 0) {
      const statusMap: Record<number, SprintStatusEnum> = {
        [SprintStatus.SPRINT_STATUS_PLANNED]: SprintStatusEnum.PLANNED,
        [SprintStatus.SPRINT_STATUS_ACTIVE]: SprintStatusEnum.ACTIVE,
        [SprintStatus.SPRINT_STATUS_COMPLETED]: SprintStatusEnum.COMPLETED,
        [SprintStatus.SPRINT_STATUS_CANCELLED]: SprintStatusEnum.CANCELLED,
      };
      where.status = statusMap[filter.status] || SprintStatusEnum.PLANNED;
    }

    return await this.repo.find({
      where,
      order: { startDate: 'ASC' },
    });
  }

  async findActiveByProject(projectId: string): Promise<SprintEntity | null> {
    return await this.repo.findOne({
      where: {
        projectId,
        status: SprintStatusEnum.ACTIVE,
      },
    });
  }

  async update(sprint: SprintEntity): Promise<SprintEntity> {
    return await this.repo.save(sprint);
  }

  async save(sprint: SprintEntity): Promise<SprintEntity> {
    return await this.repo.save(sprint);
  }
}
