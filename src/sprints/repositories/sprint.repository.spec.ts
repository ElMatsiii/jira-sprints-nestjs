import { SprintRepository } from './sprint.repository';
import { SprintEntity, SprintStatusEnum } from '../entities/sprint.entity';
import { SprintStatus } from 'jira-contracts/gen/ts';

describe('SprintRepository', () => {
  let repository: SprintRepository;
  let mockTypeOrmRepo: any;

  beforeEach(() => {
    mockTypeOrmRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn((entity) => Promise.resolve({ id: 'sprint-1', ...entity })),
      findOneBy: jest.fn().mockResolvedValue({ id: 'sprint-1' }),
      findOne: jest.fn().mockResolvedValue({ id: 'sprint-active', status: SprintStatusEnum.ACTIVE }),
      find: jest.fn().mockResolvedValue([{ id: 'sprint-1' }]),
    };
    repository = new SprintRepository(mockTypeOrmRepo);
  });

  it('should create and save a sprint entity', async () => {
    const res = await repository.create({ name: 'Sprint 1', projectId: 'p-1' });
    expect(mockTypeOrmRepo.create).toHaveBeenCalled();
    expect(mockTypeOrmRepo.save).toHaveBeenCalled();
    expect(res.id).toBe('sprint-1');
  });

  it('should find sprint by id', async () => {
    const res = await repository.findById('sprint-1');
    expect(res?.id).toBe('sprint-1');
    expect(mockTypeOrmRepo.findOneBy).toHaveBeenCalledWith({ id: 'sprint-1' });
  });

  it('should fallback to findOne if findOneBy is not available', async () => {
    delete mockTypeOrmRepo.findOneBy;
    const res = await repository.findById('sprint-1');
    expect(mockTypeOrmRepo.findOne).toHaveBeenCalledWith({ where: { id: 'sprint-1' } });
  });

  it('should find all with filter', async () => {
    const res = await repository.findAll({
      projectId: 'p-1',
      status: SprintStatus.SPRINT_STATUS_ACTIVE,
    });
    expect(res).toHaveLength(1);
    expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
      where: { projectId: 'p-1', status: SprintStatusEnum.ACTIVE },
      order: { startDate: 'ASC' },
    });
  });

  it('should find active sprint by project', async () => {
    const res = await repository.findActiveByProject('p-1');
    expect(res?.id).toBe('sprint-active');
    expect(mockTypeOrmRepo.findOne).toHaveBeenCalledWith({
      where: { projectId: 'p-1', status: SprintStatusEnum.ACTIVE },
    });
  });

  it('should update and save sprint', async () => {
    const sprint = new SprintEntity();
    sprint.id = 'sprint-up';
    const res = await repository.update(sprint);
    expect(mockTypeOrmRepo.save).toHaveBeenCalledWith(sprint);
    expect(res.id).toBe('sprint-up');

    const res2 = await repository.save(sprint);
    expect(res2.id).toBe('sprint-up');
  });
});
