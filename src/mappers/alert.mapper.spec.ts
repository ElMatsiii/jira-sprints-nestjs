import { AlertMapper } from './alert.mapper';
import { SprintAlertEntity } from '../database/entities/sprint-alert.entity';

describe('AlertMapper', () => {
  it('should map SprintAlertEntity to Protobuf SprintAlert message', () => {
    const entity = new SprintAlertEntity();
    entity.id = 'alert-1';
    entity.sprintId = 'sprint-1';
    entity.type = 1; // SCOPE_CREEP
    entity.severity = 2; // WARNING
    entity.message = 'Scope alert';
    entity.recommendation = 'Check scope';
    entity.timestamp = 1600000000000;
    entity.acknowledged = true;

    const proto = AlertMapper.toProto(entity);

    expect(proto.id).toBe('alert-1');
    expect(proto.sprintId).toBe('sprint-1');
    expect(proto.type).toBe(1);
    expect(proto.severity).toBe(2);
    expect(proto.message).toBe('Scope alert');
    expect(proto.recommendation).toBe('Check scope');
    expect(proto.timestamp).toBe(BigInt(1600000000000));
    expect(proto.acknowledged).toBe(true);
  });

  it('should return null if entity is null in toProto', () => {
    expect(AlertMapper.toProto(null as any)).toBeNull();
  });
});
