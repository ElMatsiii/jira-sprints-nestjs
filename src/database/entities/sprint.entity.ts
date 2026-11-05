import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { SprintAlertEntity } from './sprint-alert.entity';
import { SprintIssueEntity } from './sprint-issue.entity';

export enum SprintStatusEnum {
  PLANNED = 'PLANNED',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('sprints')
@Index('idx_sprints_single_active_per_project', ['projectId'], {
  unique: true,
  where: "status = 'ACTIVE'",
})
export class SprintEntity {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  id: string;

  @Column({ name: 'project_id', type: 'varchar', length: 255 })
  @Index('idx_sprints_project_id')
  projectId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', default: '' })
  goal: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: SprintStatusEnum.PLANNED,
  })
  @Index('idx_sprints_status')
  status: SprintStatusEnum = SprintStatusEnum.PLANNED;

  @Column({ name: 'start_date', type: 'bigint', default: 0 })
  startDate: any = 0;

  @Column({ name: 'end_date', type: 'bigint', default: 0 })
  endDate: any = 0;

  @Column({ name: 'total_story_points', type: 'int', default: 0 })
  totalStoryPoints: number = 0;

  @Column({ name: 'completed_story_points', type: 'int', default: 0 })
  completedStoryPoints: number = 0;

  @VersionColumn({ default: 1 })
  version: number = 1;

  @CreateDateColumn({ name: 'created_at' })
  @Index('idx_sprints_created_at')
  createdAt: Date = new Date();

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date = new Date();

  @OneToMany(() => SprintAlertEntity, (alert) => alert.sprint, { cascade: true })
  alerts?: SprintAlertEntity[];

  @OneToMany(() => SprintIssueEntity, (si) => si.sprint, { cascade: true })
  sprintIssues?: SprintIssueEntity[];

  /**
   * Helper to get start timestamp as number
   */
  getStartTimestamp(): number {
    if (!this.startDate) return 0;
    if (this.startDate instanceof Date) return this.startDate.getTime();
    return Number(this.startDate);
  }

  /**
   * Helper to get end timestamp as number
   */
  getEndTimestamp(): number {
    if (!this.endDate) return 0;
    if (this.endDate instanceof Date) return this.endDate.getTime();
    return Number(this.endDate);
  }

  /**
   * Validates sprint start and end dates
   */
  validateDates(): void {
    const start = this.getStartTimestamp();
    const end = this.getEndTimestamp();

    if (start && end && start >= end) {
      throw new Error('Start date must be before end date');
    }

    const maxDurationMs = 60 * 86400000; // 60 days
    if (start && end && end - start > maxDurationMs) {
      throw new Error('Sprint duration cannot exceed 60 days');
    }
  }

  /**
   * Domain transition: PLANNED -> ACTIVE
   */
  start(): void {
    if (this.status === SprintStatusEnum.ACTIVE) {
      throw new Error('Cannot start sprint in status ACTIVE');
    }
    if (this.status === SprintStatusEnum.COMPLETED) {
      throw new Error('Cannot start sprint in status COMPLETED');
    }
    if (this.status !== SprintStatusEnum.PLANNED) {
      throw new Error(`Cannot start sprint in status ${this.status}`);
    }

    this.validateDates();
    this.status = SprintStatusEnum.ACTIVE;
  }

  /**
   * Domain transition: ACTIVE -> COMPLETED
   */
  complete(totalStoryPoints?: number, completedStoryPoints?: number): void {
    if (this.status === SprintStatusEnum.PLANNED) {
      throw new Error('Cannot complete sprint in status PLANNED');
    }
    if (this.status !== SprintStatusEnum.ACTIVE) {
      throw new Error(`Cannot complete sprint in status ${this.status}`);
    }

    this.status = SprintStatusEnum.COMPLETED;
    if (totalStoryPoints !== undefined) {
      this.totalStoryPoints = Math.max(0, totalStoryPoints);
    }
    if (completedStoryPoints !== undefined) {
      this.completedStoryPoints = Math.max(0, completedStoryPoints);
    }
  }
}
