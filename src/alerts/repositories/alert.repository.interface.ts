import { SprintAlertEntity } from '../../database/entities/sprint-alert.entity';

export interface IAlertRepository {
  create(alert: Partial<SprintAlertEntity>): Promise<SprintAlertEntity>;
  save(alert: Partial<SprintAlertEntity>): Promise<SprintAlertEntity>;
  findBySprintId(sprintId: string): Promise<SprintAlertEntity[]>;
  findById(id: string): Promise<SprintAlertEntity | null>;
}
