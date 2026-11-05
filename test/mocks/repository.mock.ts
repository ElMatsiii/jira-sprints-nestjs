import { Repository } from 'typeorm';

export type MockRepository<T = any> = Partial<Record<keyof Repository<T>, jest.Mock>>;

export const createMockRepository = <T = any>(): MockRepository<T> => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  findOneBy: jest.fn().mockResolvedValue(null),
  create: jest.fn((dto) => dto),
  save: jest.fn((entity) => Promise.resolve({ id: 'mock-uuid-1', ...entity })),
  update: jest.fn((id, update) => Promise.resolve({ affected: 1 })),
  delete: jest.fn((id) => Promise.resolve({ affected: 1 })),
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(null),
    getMany: jest.fn().mockResolvedValue([]),
  })),
});
