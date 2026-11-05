import { of, throwError } from 'rxjs';
import { IssuesGrpcClient } from './issues-grpc.client';

describe('IssuesGrpcClient', () => {
  let client: IssuesGrpcClient;
  let mockIssueServiceStub: any;

  beforeEach(() => {
    mockIssueServiceStub = {
      listIssues: jest.fn(),
      batchUpdateIssueSprint: jest.fn(),
      close: jest.fn(),
    };
    client = new IssuesGrpcClient(mockIssueServiceStub);
  });

  it('should list issues by sprint and map protobuf response', async () => {
    mockIssueServiceStub.listIssues.mockReturnValue(
      of({
        issues: [
          { id: 'iss-1', key: 'PROJ-1', sprintId: 'sprint-1', status: 1, storyPoints: 5 },
          { id: 'iss-2', key: 'PROJ-2', sprintId: 'sprint-1', status: 4, storyPoints: 8 },
        ],
        totalCount: 2,
      }),
    );

    const issues = await client.listIssuesBySprint('sprint-1');
    expect(issues).toHaveLength(2);
    expect(issues[0].key).toBe('PROJ-1');
    expect(mockIssueServiceStub.listIssues).toHaveBeenCalledWith(
      expect.objectContaining({ sprintId: 'sprint-1' }),
    );
  });

  it('should remove issues from sprint by setting empty sprintId', async () => {
    mockIssueServiceStub.batchUpdateIssueSprint.mockReturnValue(
      of({ updatedCount: 2, issues: [] }),
    );

    const count = await client.removeIssuesFromSprint(['iss-1', 'iss-2']);
    expect(count).toBe(2);
    expect(mockIssueServiceStub.batchUpdateIssueSprint).toHaveBeenCalledWith(
      expect.objectContaining({
        issueIds: ['iss-1', 'iss-2'],
        sprintId: '',
      }),
    );
  });

  it('should translate gRPC UNAVAILABLE error into ResilientServiceException', async () => {
    mockIssueServiceStub.listIssues.mockReturnValue(
      throwError(() => ({ code: 14, details: 'MS1 unavailable' })),
    );

    await expect(client.listIssuesBySprint('sprint-1')).rejects.toThrow(
      'MS1 Issues Service is currently unavailable',
    );
  });

  it('should support moveIssuesToSprint', async () => {
    mockIssueServiceStub.batchUpdateIssueSprint.mockReturnValue(
      of({ updatedCount: 1, issues: [] }),
    );

    const count = await client.moveIssuesToSprint(['iss-1'], 'sprint-target');
    expect(count).toBe(1);
    expect(mockIssueServiceStub.batchUpdateIssueSprint).toHaveBeenCalledWith(
      expect.objectContaining({
        issueIds: ['iss-1'],
        sprintId: 'sprint-target',
      }),
    );
  });

  it('should return empty result if issueIds is empty in batchUpdateIssueSprint', async () => {
    const res = await client.batchUpdateIssueSprint([], 'sprint-1');
    expect(res.updatedCount).toBe(0);
    expect(res.issues).toEqual([]);
    expect(mockIssueServiceStub.batchUpdateIssueSprint).not.toHaveBeenCalled();
  });

  it('should support callback based listIssues', async () => {
    mockIssueServiceStub.listIssues.mockImplementation((...args: any[]) => {
      const cb = args.find((a) => typeof a === 'function');
      if (cb) {
        cb(null, {
          issues: [{ id: 'iss-cb', key: 'P-1', status: 1, storyPoints: 3 }],
        });
      }
    });

    const issues = await client.listIssuesBySprint('sprint-cb');
    expect(issues).toHaveLength(1);
    expect(issues[0].id).toBe('iss-cb');
  });

  it('should support callback based batchUpdateIssueSprint', async () => {
    mockIssueServiceStub.batchUpdateIssueSprint.mockImplementation((...args: any[]) => {
      const cb = args.find((a) => typeof a === 'function');
      if (cb) {
        cb(null, {
          updatedCount: 3,
          issues: [{ id: 'iss-cb2', key: 'P-2', status: 1, storyPoints: 2 }],
        });
      }
    });

    const res = await client.batchUpdateIssueSprint(['iss-cb2'], 'sprint-cb');
    expect(res.updatedCount).toBe(3);
    expect(res.issues).toHaveLength(1);
  });

  it('should rethrow non-14 errors as-is in listIssuesBySprint', async () => {
    mockIssueServiceStub.listIssues.mockReturnValue(
      throwError(() => new Error('Custom validation failed')),
    );

    await expect(client.listIssuesBySprint('sprint-err')).rejects.toThrow('Custom validation failed');
  });

  it('should close client onModuleDestroy', () => {
    client.onModuleDestroy();
    expect(mockIssueServiceStub.close).toHaveBeenCalled();
  });
});
