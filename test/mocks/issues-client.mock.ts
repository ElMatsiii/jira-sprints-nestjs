export interface MockIssue {
  id: string;
  key: string;
  projectId: string;
  title: string;
  status: number;
  storyPoints: number;
  sprintId?: string;
}

export const createMockIssuesClient = () => ({
  listIssuesBySprint: jest.fn().mockResolvedValue([]),
  moveIssuesToSprint: jest.fn().mockResolvedValue(0),
  removeIssuesFromSprint: jest.fn().mockResolvedValue(0),
  batchUpdateIssueSprint: jest.fn().mockResolvedValue({ updatedCount: 0, issues: [] }),
});
