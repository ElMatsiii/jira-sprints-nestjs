import { SprintAlertEntity } from '../database/entities/sprint-alert.entity';

export class AlertMapper {
  static toProto(entity: SprintAlertEntity): any {
    if (!entity) return null;

    const ts = entity.timestamp
      ? entity.timestamp instanceof Date
        ? entity.timestamp.getTime()
        : Number(entity.timestamp)
      : entity.createdAt
      ? entity.createdAt.getTime()
      : Date.now();

    return {
      id: entity.id || '',
      sprintId: entity.sprintId || '',
      sprint_id: entity.sprintId || '',
      type: Number(entity.type || 0),
      severity: Number(entity.severity || 1),
      message: entity.message || '',
      recommendation: entity.recommendation || '',
      timestamp: BigInt(ts),
      acknowledged: entity.acknowledged ?? true,
    };
  }
}
