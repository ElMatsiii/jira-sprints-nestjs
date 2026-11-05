import { AlertRepository } from './alert.repository';
import { SprintAlertEntity } from '../../database/entities/sprint-alert.entity';

describe('AlertRepository', () => {
  let repository: AlertRepository;
  let mockTypeOrmRepo: any;

  beforeEach(() => {
    mockTypeOrmRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn((entity) => Promise.resolve({ id: 'alert-1', ...entity })),
      findOneBy: jest.fn().mockResolvedValue({ id: 'alert-1' }),
      findOne: jest.fn().mockResolvedValue({ id: 'alert-1' }),
      find: jest.fn().mockResolvedValue([{ id: 'alert-1', sprintId: 'sprint-1' }]),
    };
    repository = new AlertRepository(mockTypeOrmRepo);
  });

  it('should create and save an alert', async () => {
    const res = await repository.create({ sprintId: 'sprint-1', message: 'test' });
    expect(mockTypeOrmRepo.create).toHaveBeenCalled();
    expect(mockTypeOrmRepo.save).toHaveBeenCalled();
    expect(res.id).toBe('alert-1');
  });

  it('should save an alert directly', async () => {
    const alert = new SprintAlertEntity();
    alert.id = 'alert-save';
    const res = await repository.save(alert);
    expect(mockTypeOrmRepo.save).toHaveBeenCalledWith(alert);
    expect(res.id).toBe('alert-save');
  });

  it('should find alerts by sprintId', async () => {
    const res = await repository.findBySprintId('sprint-1');
    expect(res).toHaveLength(1);
    expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
      where: { sprintId: 'sprint-1' },
      order: { createdAt: 'DESC' },
    });
  });

  it('should find alert by id', async () => {
    const res = await repository.findById('alert-1');
    expect(res?.id).toBe('alert-1');
    expect(mockTypeOrmRepo.findOneBy).toHaveBeenCalledWith({ id: 'alert-1' });
  });

  it('should fallback to findOne if findOneBy is not available', async () => {
    delete mockTypeOrmRepo.findOneBy;
    const res = await repository.findById('alert-1');
    expect(mockTypeOrmRepo.findOne).toHaveBeenCalledWith({ where: { id: 'alert-1' } });
  });
});
