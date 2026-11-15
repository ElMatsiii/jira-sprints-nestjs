import { IssuePriority, IssueStatus, IssueType } from 'jira-contracts/gen/ts';
import { toLocalIssue, toLocalIssuePriority, toLocalIssueStatus, toLocalIssueType } from './issue.mapper';

describe('issue.mapper (MS1 gRPC Issue → MS2 IssueDto)', () => {
  it.each([
    [IssueStatus.ISSUE_STATUS_TODO, 'TODO'],
    [IssueStatus.ISSUE_STATUS_IN_PROGRESS, 'IN_PROGRESS'],
    [IssueStatus.ISSUE_STATUS_IN_REVIEW, 'IN_REVIEW'],
    [IssueStatus.ISSUE_STATUS_DONE, 'DONE'],
    [IssueStatus.ISSUE_STATUS_UNSPECIFIED, 'UNKNOWN'],
    [99, 'UNKNOWN'],
  ])('maps proto status %p to %p', (proto, local) => {
    expect(toLocalIssueStatus(proto)).toBe(local);
  });

  it('accepts enum names (loaders configured with enums: String) and numeric strings', () => {
    expect(toLocalIssueStatus('ISSUE_STATUS_DONE')).toBe('DONE');
    expect(toLocalIssueStatus('done')).toBe('DONE');
    expect(toLocalIssueStatus('4')).toBe('DONE');
    expect(toLocalIssueStatus('ISSUE_STATUS_BLOCKED')).toBe('UNKNOWN');
    expect(toLocalIssueStatus('')).toBe('UNKNOWN');
    expect(toLocalIssueStatus(undefined)).toBe('UNKNOWN');
    expect(toLocalIssueStatus(null)).toBe('UNKNOWN');
  });

  it.each([
    [IssuePriority.ISSUE_PRIORITY_LOW, 'LOW'],
    [IssuePriority.ISSUE_PRIORITY_MEDIUM, 'MEDIUM'],
    [IssuePriority.ISSUE_PRIORITY_HIGH, 'HIGH'],
    [IssuePriority.ISSUE_PRIORITY_CRITICAL, 'CRITICAL'],
    [IssuePriority.ISSUE_PRIORITY_UNSPECIFIED, 'UNKNOWN'],
  ])('maps proto priority %p to %p', (proto, local) => {
    expect(toLocalIssuePriority(proto)).toBe(local);
  });

  it.each([
    [IssueType.ISSUE_TYPE_STORY, 'STORY'],
    [IssueType.ISSUE_TYPE_TASK, 'TASK'],
    [IssueType.ISSUE_TYPE_BUG, 'BUG'],
    [IssueType.ISSUE_TYPE_EPIC, 'EPIC'],
    ['ISSUE_TYPE_EPIC', 'EPIC'],
    [0, 'UNKNOWN'],
  ])('maps proto type %p to %p', (proto, local) => {
    expect(toLocalIssueType(proto)).toBe(local);
  });

  it('builds the full local issue from a camelCase proto message', () => {
    expect(
      toLocalIssue({
        id: 'iss-1', key: 'PROJ-1', projectId: 'p-1', title: 'Pagos', description: 'd',
        status: IssueStatus.ISSUE_STATUS_IN_REVIEW, priority: IssuePriority.ISSUE_PRIORITY_HIGH,
        type: IssueType.ISSUE_TYPE_BUG, storyPoints: 5, sprintId: 's-1',
      }),
    ).toEqual({
      id: 'iss-1', key: 'PROJ-1', projectId: 'p-1', title: 'Pagos', description: 'd',
      status: 'IN_REVIEW', priority: 'HIGH', type: 'BUG', storyPoints: 5, sprintId: 's-1',
    });
  });

  it('accepts snake_case fields and defends against missing or invalid values', () => {
    expect(toLocalIssue({ id: 'x', project_id: 'p', story_points: '3', sprint_id: 's' })).toMatchObject({
      projectId: 'p', storyPoints: 3, sprintId: 's', status: 'UNKNOWN', priority: 'UNKNOWN', type: 'UNKNOWN',
    });
    expect(toLocalIssue({ id: 'y', storyPoints: -4 }).storyPoints).toBe(0);
    expect(toLocalIssue({ id: 'z', storyPoints: 'abc' }).storyPoints).toBe(0);
    expect(toLocalIssue({ id: 'w', sprintId: '' }).sprintId).toBeUndefined();
    expect(toLocalIssue(undefined)).toMatchObject({ id: '', key: '', storyPoints: 0, status: 'UNKNOWN' });
  });
});
