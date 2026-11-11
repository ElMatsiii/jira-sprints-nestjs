import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { readdir, readFile } from 'node:fs/promises';
import * as path from 'node:path';

const MIGRATION_LOCK = [731924, 1] as const;

@Injectable()
export class DatabaseMigrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseMigrationService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.runMigrations();
  }

  async runMigrations(): Promise<void> {
    const migrationsDir = process.env.MIGRATIONS_DIR || path.resolve(process.cwd(), 'db/migrations');
    const migrationFiles = (await readdir(migrationsDir))
      .filter((file) => file.endsWith('.up.sql'))
      .sort();

    if (migrationFiles.length === 0) {
      throw new Error(`No SQL migrations found in ${migrationsDir}`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    let lockAcquired = false;
    try {
      await queryRunner.query('SELECT pg_advisory_lock($1, $2)', [...MIGRATION_LOCK]);
      lockAcquired = true;
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS jira_schema_migrations (
          name TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      const appliedRows = await queryRunner.query('SELECT name FROM jira_schema_migrations');
      const appliedMigrations = new Set(
        (appliedRows as Array<{ name: string }>).map(({ name }) => name),
      );

      for (const file of migrationFiles) {
        const name = file.replace(/\.up\.sql$/, '');
        if (appliedMigrations.has(name)) {
          continue;
        }

        await this.applyMigration(queryRunner, migrationsDir, file, name);
      }
    } finally {
      try {
        if (lockAcquired) {
          await queryRunner.query('SELECT pg_advisory_unlock($1, $2)', [...MIGRATION_LOCK]);
        }
      } finally {
        await queryRunner.release();
      }
    }
  }

  private async applyMigration(
    queryRunner: QueryRunner,
    migrationsDir: string,
    file: string,
    name: string,
  ): Promise<void> {
    await queryRunner.startTransaction();
    try {
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      await queryRunner.query(sql);
      await queryRunner.query('INSERT INTO jira_schema_migrations (name) VALUES ($1)', [name]);
      await queryRunner.commitTransaction();
      this.logger.log(`Applied database migration ${name}`);
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    }
  }
}
