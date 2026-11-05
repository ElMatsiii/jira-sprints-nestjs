import { SprintEntity } from '../entities/sprint.entity';

export interface ISprintRepository {
  create(sprint: Partial<SprintEntity>): Promise<SprintEntity>;
  findById(id: string): Promise<SprintEntity | null>;
  findAll(filter?: { projectId?: string; status?: number }): Promise<SprintEntity[]>;
  findActiveByProject(projectId: string): Promise<SprintEntity | null>;
  update(sprint: SprintEntity): Promise<SprintEntity>;
  save(sprint: SprintEntity): Promise<SprintEntity>;
}
