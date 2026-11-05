import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SprintAlertEntity } from '../../database/entities/sprint-alert.entity';
import { IAlertRepository } from './alert.repository.interface';

@Injectable()
export class AlertRepository implements IAlertRepository {
  constructor(
    @Optional()
    @InjectRepository(SprintAlertEntity)
    private readonly repo: Repository<SprintAlertEntity>,
  ) {}

  async create(alert: Partial<SprintAlertEntity>): Promise<SprintAlertEntity> {
    const entity = this.repo.create(alert);
    return await this.repo.save(entity);
  }

  async save(alert: Partial<SprintAlertEntity>): Promise<SprintAlertEntity> {
    return await this.repo.save(alert as SprintAlertEntity);
  }

  async findBySprintId(sprintId: string): Promise<SprintAlertEntity[]> {
    return await this.repo.find({
      where: { sprintId },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<SprintAlertEntity | null> {
    if (typeof this.repo.findOneBy === 'function') {
      return await this.repo.findOneBy({ id });
    }
    return await this.repo.findOne({ where: { id } });
  }
}
