import { IssuePriority, IssueStatus, IssueType } from 'jira-contracts/gen/ts';
import {
  IssueDto,
  LocalIssuePriority,
  LocalIssueStatus,
  LocalIssueType,
} from '../interfaces/issues-client.interface';

/**
 * MS1 → MS2 edge: converts MS1's gRPC Issue (numeric proto enums, snake/camel field names) into
 * MS2's own IssueDto (interoperability rule). This is the only place in MS2 that knows MS1's enums.
 */

const STATUS_BY_PROTO: Record<number, LocalIssueStatus> = {
  [IssueStatus.ISSUE_STATUS_TODO]: 'TODO',
  [IssueStatus.ISSUE_STATUS_IN_PROGRESS]: 'IN_PROGRESS',
  [IssueStatus.ISSUE_STATUS_IN_REVIEW]: 'IN_REVIEW',
  [IssueStatus.ISSUE_STATUS_DONE]: 'DONE',
};

const PRIORITY_BY_PROTO: Record<number, LocalIssuePriority> = {
  [IssuePriority.ISSUE_PRIORITY_LOW]: 'LOW',
  [IssuePriority.ISSUE_PRIORITY_MEDIUM]: 'MEDIUM',
  [IssuePriority.ISSUE_PRIORITY_HIGH]: 'HIGH',
  [IssuePriority.ISSUE_PRIORITY_CRITICAL]: 'CRITICAL',
};

const TYPE_BY_PROTO: Record<number, LocalIssueType> = {
  [IssueType.ISSUE_TYPE_STORY]: 'STORY',
  [IssueType.ISSUE_TYPE_TASK]: 'TASK',
  [IssueType.ISSUE_TYPE_BUG]: 'BUG',
  [IssueType.ISSUE_TYPE_EPIC]: 'EPIC',
};

/**
 * Accepts the numeric value sent by ts-proto/grpc-js, or a name ("ISSUE_STATUS_DONE" or "DONE")
 * when a loader is configured with `enums: String`. Unknown values become 'UNKNOWN'.
 */
function fromProtoEnum<T extends string>(value: unknown, byNumber: Record<number, T>, prefix: string): T | 'UNKNOWN' {
  if (typeof value === 'number') return byNumber[value] ?? 'UNKNOWN';
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    if (Number.isInteger(numeric)) return byNumber[numeric] ?? 'UNKNOWN';
    const name = value.trim().toUpperCase().replace(prefix, '') as T;
    return (Object.values(byNumber) as T[]).includes(name) ? name : 'UNKNOWN';
  }
  return 'UNKNOWN';
}

export const toLocalIssueStatus = (value: unknown): LocalIssueStatus =>
  fromProtoEnum(value, STATUS_BY_PROTO, 'ISSUE_STATUS_');

export const toLocalIssuePriority = (value: unknown): LocalIssuePriority =>
  fromProtoEnum(value, PRIORITY_BY_PROTO, 'ISSUE_PRIORITY_');

export const toLocalIssueType = (value: unknown): LocalIssueType =>
  fromProtoEnum(value, TYPE_BY_PROTO, 'ISSUE_TYPE_');

export function toLocalIssue(item: any): IssueDto {
  return {
    id: item?.id || '',
    key: item?.key || '',
    projectId: item?.projectId || item?.project_id || '',
    title: item?.title || '',
    description: item?.description || '',
    status: toLocalIssueStatus(item?.status),
    priority: toLocalIssuePriority(item?.priority),
    type: toLocalIssueType(item?.type),
    storyPoints: Math.max(0, Number(item?.storyPoints ?? item?.story_points ?? 0) || 0),
    sprintId: item?.sprintId || item?.sprint_id || undefined,
  };
}
