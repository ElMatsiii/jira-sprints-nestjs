export interface IssueDto {
  id: string;
  key: string;
  projectId: string;
  title: string;
  description?: string;
  status: number;
  priority?: number;
  type?: number;
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
