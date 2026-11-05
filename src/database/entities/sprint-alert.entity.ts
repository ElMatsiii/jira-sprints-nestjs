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

export enum AlertTypeEnum {
  ALERT_TYPE_UNSPECIFIED = 0,
  ALERT_TYPE_SCOPE_CREEP = 1,
  ALERT_TYPE_VELOCITY_DEFICIT = 2,
  ALERT_TYPE_BOTTLENECK_DETECTED = 3,
}

export enum AlertSeverityEnum {
  ALERT_SEVERITY_UNSPECIFIED = 0,
  ALERT_SEVERITY_INFO = 1,
  ALERT_SEVERITY_WARNING = 2,
  ALERT_SEVERITY_CRITICAL = 3,
}

@Entity('sprint_alerts')
export class SprintAlertEntity {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  id: string;

  @Column({ name: 'sprint_id', type: 'varchar', length: 255 })
  @Index('idx_sprint_alerts_sprint_id')
  sprintId: string;

  @Column({ name: 'alert_type', type: 'int' })
  type: number;

  @Column({ type: 'int', default: 1 })
  severity: number = 1;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'text', default: '' })
  recommendation: string = '';

  @Column({ type: 'boolean', default: true })
  acknowledged: boolean = true;

  @Column({ type: 'bigint', default: 0 })
  timestamp: any = 0;

  @CreateDateColumn({ name: 'created_at' })
  @Index('idx_sprint_alerts_created_at')
  createdAt: Date = new Date();

  @ManyToOne(() => SprintEntity, (sprint) => sprint.alerts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sprint_id' })
  sprint?: SprintEntity;
}
