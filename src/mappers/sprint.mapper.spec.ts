import { SprintMapper } from './sprint.mapper';
import { SprintEntity, SprintStatusEnum } from '../sprints/entities/sprint.entity';

describe('SprintMapper', () => {
  it('should map SprintEntity to Protobuf Sprint message with epoch timestamps', () => {
    const entity = new SprintEntity();
    entity.id = '11111111-1111-1111-1111-111111111111';
    entity.projectId = '22222222-2222-2222-2222-222222222222';
    entity.name = 'Sprint 10';
    entity.goal = 'Feature Complete';
    entity.status = SprintStatusEnum.ACTIVE;
    entity.startDate = new Date('2026-11-01T00:00:00Z');
    entity.endDate = new Date('2026-11-15T00:00:00Z');
    entity.totalStoryPoints = 45;
    entity.completedStoryPoints = 30;
    entity.createdAt = new Date('2026-10-25T00:00:00Z');
    entity.updatedAt = new Date('2026-10-26T00:00:00Z');

    const proto = SprintMapper.toProto(entity);

    expect(proto.id).toBe(entity.id);
    expect(proto.projectId).toBe(entity.projectId);
    expect(proto.name).toBe('Sprint 10');
    expect(proto.status).toBe(2); // SPRINT_STATUS_ACTIVE
    expect(proto.startDate).toBe(BigInt(entity.startDate.getTime()));
    expect(proto.endDate).toBe(BigInt(entity.endDate.getTime()));
    expect(proto.totalStoryPoints).toBe(45);
    expect(proto.completedStoryPoints).toBe(30);
  });

  it('should handle optional / null date fields gracefully', () => {
    const entity = new SprintEntity();
    entity.id = 's-1';
    entity.name = 'Backlog Sprint';
    entity.status = SprintStatusEnum.PLANNED;
    entity.startDate = null as any;
    entity.endDate = null as any;

    const proto = SprintMapper.toProto(entity);
    expect(proto.startDate).toBe(BigInt(0));
    expect(proto.endDate).toBe(BigInt(0));
  });

  it('should map Protobuf to SprintEntity via toEntity', () => {
    const proto = {
      id: 's-10',
      projectId: 'p-1',
      name: 'Sprint 10',
      goal: 'Goal',
      startDate: 1000,
      endDate: 2000,
      status: 3, // COMPLETED
      totalStoryPoints: 20,
      completedStoryPoints: 20,
    };

    const entity = SprintMapper.toEntity(proto);
    expect(entity.id).toBe('s-10');
    expect(entity.status).toBe(SprintStatusEnum.COMPLETED);
    expect(entity.totalStoryPoints).toBe(20);
  });

  it('should return null if entity is null in toProto', () => {
    expect(SprintMapper.toProto(null as any)).toBeNull();
  });
});
