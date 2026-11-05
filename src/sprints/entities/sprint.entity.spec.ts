import { SprintEntity, SprintStatusEnum } from './sprint.entity';

describe('SprintEntity Domain Logic', () => {
  it('should initialize with status PLANNED by default', () => {
    const sprint = new SprintEntity();
    sprint.name = 'Sprint 1';
    sprint.projectId = 'proj-101';
    expect(sprint.status).toBe(SprintStatusEnum.PLANNED);
  });

  it('should allow valid transition from PLANNED to ACTIVE', () => {
    const sprint = new SprintEntity();
    sprint.status = SprintStatusEnum.PLANNED;
    sprint.startDate = new Date(Date.now() - 10000);
    sprint.endDate = new Date(Date.now() + 86400000 * 14);

    expect(() => sprint.start()).not.toThrow();
    expect(sprint.status).toBe(SprintStatusEnum.ACTIVE);
  });

  it('should reject starting a sprint that is already ACTIVE', () => {
    const sprint = new SprintEntity();
    sprint.status = SprintStatusEnum.ACTIVE;

    expect(() => sprint.start()).toThrow('Cannot start sprint in status ACTIVE');
  });

  it('should reject starting a sprint that is already COMPLETED', () => {
    const sprint = new SprintEntity();
    sprint.status = SprintStatusEnum.COMPLETED;

    expect(() => sprint.start()).toThrow('Cannot start sprint in status COMPLETED');
  });

  it('should allow valid transition from ACTIVE to COMPLETED', () => {
    const sprint = new SprintEntity();
    sprint.status = SprintStatusEnum.ACTIVE;

    expect(() => sprint.complete(40, 35)).not.toThrow();
    expect(sprint.status).toBe(SprintStatusEnum.COMPLETED);
    expect(sprint.totalStoryPoints).toBe(40);
    expect(sprint.completedStoryPoints).toBe(35);
  });

  it('should reject completing a sprint that is in PLANNED status', () => {
    const sprint = new SprintEntity();
    sprint.status = SprintStatusEnum.PLANNED;

    expect(() => sprint.complete(10, 10)).toThrow('Cannot complete sprint in status PLANNED');
  });

  it('should validate that startDate must be before endDate', () => {
    const sprint = new SprintEntity();
    sprint.startDate = new Date('2026-11-01');
    sprint.endDate = new Date('2026-10-01');

    expect(() => sprint.validateDates()).toThrow('Start date must be before end date');
  });

  it('should reject sprint durations exceeding 60 days', () => {
    const sprint = new SprintEntity();
    sprint.startDate = new Date('2026-01-01');
    sprint.endDate = new Date('2026-04-01');

    expect(() => sprint.validateDates()).toThrow('Sprint duration cannot exceed 60 days');
  });

  it('should handle numeric timestamps in getStartTimestamp and getEndTimestamp', () => {
    const sprint = new SprintEntity();
    sprint.startDate = 1000;
    sprint.endDate = 2000;
    expect(sprint.getStartTimestamp()).toBe(1000);
    expect(sprint.getEndTimestamp()).toBe(2000);
  });
});
