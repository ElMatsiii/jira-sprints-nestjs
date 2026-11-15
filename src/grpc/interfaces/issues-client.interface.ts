/** MS2's own view of an issue status (MS1's proto enum is converted in grpc/mappers/issue.mapper.ts). */
export type LocalIssueStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'UNKNOWN';
export type LocalIssuePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
export type LocalIssueType = 'STORY' | 'TASK' | 'BUG' | 'EPIC' | 'UNKNOWN';

/** Issue as MS2 uses it (local model built from MS1's gRPC Issue). */
export interface IssueDto {
  id: string;
  key: string;
  projectId: string;
  title: string;
  description?: string;
  status: LocalIssueStatus;
  priority: LocalIssuePriority;
  type: LocalIssueType;
  storyPoints: number;
  sprintId?: string;
}

export interface BatchUpdateResultDto {
  updatedCount: number;
  issues: IssueDto[];
}

export interface IIssuesClient {
  listIssuesBySprint(sprintId: string): Promise<IssueDto[]>;
  batchUpdateIssueSprint(issueIds: string[], sprintId: string): Promise<BatchUpdateResultDto>;
  removeIssuesFromSprint(issueIds: string[]): Promise<number>;
  moveIssuesToSprint(issueIds: string[], sprintId: string): Promise<number>;
}
