import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { SprintEntity } from './sprint.entity';

@Entity('sprint_issues')
export class SprintIssueEntity {
  @PrimaryColumn({ name: 'sprint_id', type: 'varchar', length: 255 })
  sprintId: string;

  @PrimaryColumn({ name: 'issue_id', type: 'varchar', length: 255 })
  @Index('idx_sprint_issues_issue_id')
  issueId: string;

  @Column({ name: 'story_points', type: 'int', default: 0 })
  storyPoints: number = 0;

  @CreateDateColumn({ name: 'added_at' })
  addedAt: Date = new Date();

  @ManyToOne(() => SprintEntity, (sprint) => sprint.sprintIssues, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sprint_id' })
  sprint?: SprintEntity;
}
