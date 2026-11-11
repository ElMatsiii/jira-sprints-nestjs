import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { DataSource, QueryRunner } from 'typeorm';
import { DatabaseMigrationService } from './database-migration.service';

describe('DatabaseMigrationService', () => {
  let migrationsDir: string;
  let originalMigrationsDir: string | undefined;
  let queryRunner: jest.Mocked<QueryRunner>;
  let service: DatabaseMigrationService;

  beforeEach(async () => {
    originalMigrationsDir = process.env.MIGRATIONS_DIR;
    migrationsDir = await mkdtemp(path.join(os.tmpdir(), 'jira-sprints-migrations-'));
    process.env.MIGRATIONS_DIR = migrationsDir;

    queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      isTransactionActive: false,
    } as unknown as jest.Mocked<QueryRunner>;

    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    } as unknown as DataSource;
    service = new DatabaseMigrationService(dataSource);
  });

  afterEach(async () => {
    if (originalMigrationsDir === undefined) {
      delete process.env.MIGRATIONS_DIR;
    } else {
      process.env.MIGRATIONS_DIR = originalMigrationsDir;
    }
    await rm(migrationsDir, { recursive: true, force: true });
  });

  it('applies pending up migrations transactionally and records them', async () => {
    await writeFile(path.join(migrationsDir, '000001_create_tables.up.sql'), 'CREATE TABLE sample (id INT);');
    await writeFile(path.join(migrationsDir, '000001_create_tables.down.sql'), 'DROP TABLE sample;');

    await service.runMigrations();

    expect(queryRunner.connect).toHaveBeenCalledTimes(1);
    expect(queryRunner.startTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.query).toHaveBeenCalledWith(
      'INSERT INTO jira_schema_migrations (name) VALUES ($1)',
      ['000001_create_tables'],
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and surfaces a failed migration', async () => {
    const migrationError = new Error('invalid migration');
    queryRunner.query
      .mockReset()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(migrationError)
      .mockResolvedValueOnce(undefined);
    Object.defineProperty(queryRunner, 'isTransactionActive', { value: true });
    await writeFile(path.join(migrationsDir, '000001_broken.up.sql'), 'INVALID SQL;');

    await expect(service.runMigrations()).rejects.toThrow('invalid migration');

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('fails explicitly when the migration directory contains no up migrations', async () => {
    await expect(service.runMigrations()).rejects.toThrow('No SQL migrations found');

    expect(queryRunner.connect).not.toHaveBeenCalled();
  });
});
