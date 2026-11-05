import { SprintEntity, SprintStatusEnum } from '../database/entities/sprint.entity';
import { SprintStatus } from 'jira-contracts/gen/ts';

export class SprintMapper {
  static toProto(entity: SprintEntity): any {
    if (!entity) return null;

    let statusCode: number = SprintStatus.SPRINT_STATUS_PLANNED;
    if (entity.status === SprintStatusEnum.ACTIVE) {
      statusCode = SprintStatus.SPRINT_STATUS_ACTIVE;
    } else if (entity.status === SprintStatusEnum.COMPLETED) {
      statusCode = SprintStatus.SPRINT_STATUS_COMPLETED;
    } else if (entity.status === SprintStatusEnum.CANCELLED) {
      statusCode = SprintStatus.SPRINT_STATUS_CANCELLED;
    } else if (typeof entity.status === 'number') {
      statusCode = entity.status;
    }

    const startTs = entity.startDate
      ? entity.startDate instanceof Date
        ? entity.startDate.getTime()
        : Number(entity.startDate)
      : 0;

    const endTs = entity.endDate
      ? entity.endDate instanceof Date
        ? entity.endDate.getTime()
        : Number(entity.endDate)
      : 0;

    const createdTs = entity.createdAt
      ? entity.createdAt instanceof Date
        ? entity.createdAt.getTime()
        : Number(entity.createdAt)
      : Date.now();

    const updatedTs = entity.updatedAt
      ? entity.updatedAt instanceof Date
        ? entity.updatedAt.getTime()
        : Number(entity.updatedAt)
      : Date.now();

    return {
      id: entity.id || '',
      projectId: entity.projectId || '',
      project_id: entity.projectId || '',
      name: entity.name || '',
      goal: entity.goal || '',
      startDate: BigInt(startTs),
      start_date: BigInt(startTs),
      endDate: BigInt(endTs),
      end_date: BigInt(endTs),
      status: statusCode,
      totalStoryPoints: entity.totalStoryPoints || 0,
      total_story_points: entity.totalStoryPoints || 0,
      completedStoryPoints: entity.completedStoryPoints || 0,
      completed_story_points: entity.completedStoryPoints || 0,
      createdAt: BigInt(createdTs),
      created_at: BigInt(createdTs),
      updatedAt: BigInt(updatedTs),
      updated_at: BigInt(updatedTs),
    };
  }

  static toEntity(proto: any): SprintEntity {
    const entity = new SprintEntity();
    entity.id = proto.id || '';
    entity.projectId = proto.projectId || proto.project_id || '';
    entity.name = proto.name || '';
    entity.goal = proto.goal || '';

    const startTs = proto.startDate ?? proto.start_date ?? 0;
    const endTs = proto.endDate ?? proto.end_date ?? 0;
    entity.startDate = Number(startTs);
    entity.endDate = Number(endTs);

    const statusVal = proto.status;
    if (statusVal === SprintStatus.SPRINT_STATUS_ACTIVE || statusVal === 'ACTIVE') {
      entity.status = SprintStatusEnum.ACTIVE;
    } else if (statusVal === SprintStatus.SPRINT_STATUS_COMPLETED || statusVal === 'COMPLETED') {
      entity.status = SprintStatusEnum.COMPLETED;
    } else if (statusVal === SprintStatus.SPRINT_STATUS_CANCELLED || statusVal === 'CANCELLED') {
      entity.status = SprintStatusEnum.CANCELLED;
    } else {
      entity.status = SprintStatusEnum.PLANNED;
    }

    entity.totalStoryPoints = Number(proto.totalStoryPoints ?? proto.total_story_points ?? 0);
    entity.completedStoryPoints = Number(proto.completedStoryPoints ?? proto.completed_story_points ?? 0);
    return entity;
  }
}
