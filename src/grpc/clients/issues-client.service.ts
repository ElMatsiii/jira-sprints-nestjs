import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import { firstValueFrom, isObservable, Observable } from 'rxjs';
import { ConfigService } from '../../config/config.service';
import { CircuitBreaker } from '../../common/utils/circuit-breaker';
import { IIssuesClient, IssueDto, BatchUpdateResultDto } from '../interfaces/issues-client.interface';
import { IssueServiceClient } from 'jira-contracts/gen/ts';

@Injectable()
export class IssuesClientService implements OnModuleInit, OnModuleDestroy, IIssuesClient {
  protected readonly logger = new Logger(IssuesClientService.name);
  protected client: any;
  protected readonly circuitBreaker: CircuitBreaker;
  private isCustomStub = false;

  constructor(@Optional() private readonly configService?: ConfigService, @Optional() customStub?: any) {
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      recoveryTimeoutMs: 10000,
      callTimeoutMs: 5000,
    });

    if (customStub) {
      this.client = customStub;
      this.isCustomStub = true;
    } else if (configService && (configService as any).listIssues) {
      // Handles case where first param is passed as stub in unit tests
      this.client = configService;
      this.isCustomStub = true;
    }
  }

  onModuleInit() {
    if (this.isCustomStub || this.client) {
      return;
    }

    const targetUrl = this.configService?.issuesGrpcUrl || process.env.MS1_GRPC_URL || 'localhost:50051';
    this.logger.log(`Initializing gRPC client to MS1 Issues Service on ${targetUrl}`);

    try {
      this.client = new IssueServiceClient(
        targetUrl,
        grpc.credentials.createInsecure(),
        {
          'grpc.keepalive_time_ms': 30000,
          'grpc.keepalive_timeout_ms': 5000,
          'grpc.keepalive_permit_without_calls': 1,
        },
      );
    } catch (err: any) {
      this.logger.warn(`Failed to create IssueServiceClient: ${err.message}`);
    }
  }

  onModuleDestroy() {
    if (this.client && typeof this.client.close === 'function') {
      try {
        this.client.close();
      } catch (err) {
        // ignore
      }
    }
  }

  async listIssuesBySprint(sprintId: string): Promise<IssueDto[]> {
    return this.circuitBreaker.execute(async () => {
      try {
        if (!this.client) {
          throw new Error('MS1 Issues Service is currently unavailable');
        }

        if (this.isCustomStub && typeof this.client.listIssues === 'function') {
          const res = this.client.listIssues({ sprintId });
          if (isObservable(res)) {
            const result = await firstValueFrom(res as Observable<any>);
            return (result?.issues || []).map(this.mapProtoIssue);
          }
        }

        const request = { sprintId: sprintId, sprint_id: sprintId, limit: 1000, offset: 0, status: 0, projectId: '' };

        return await new Promise<IssueDto[]>((resolve, reject) => {
          const metadata = new grpc.Metadata();
          const deadline = new Date(Date.now() + 5000);

          try {
            const res = this.client.listIssues(request, metadata, { deadline }, (err: any, response: any) => {
              if (err) return reject(err);
              const issues = (response?.issues || []).map(this.mapProtoIssue);
              resolve(issues);
            });

            if (isObservable(res)) {
              firstValueFrom(res as Observable<any>).then(
                (result: any) => {
                  const issues = (result?.issues || []).map(this.mapProtoIssue);
                  resolve(issues);
                },
                (err: any) => reject(err),
              );
            }
          } catch (callErr) {
            reject(callErr);
          }
        });
      } catch (err: any) {
        if (
          err?.code === 14 ||
          err?.code === '14' ||
          String(err?.message || '').includes('unavailable') ||
          String(err?.details || '').includes('unavailable')
        ) {
          throw new Error('MS1 Issues Service is currently unavailable');
        }
        throw err;
      }
    });
  }

  async batchUpdateIssueSprint(issueIds: string[], sprintId: string): Promise<BatchUpdateResultDto> {
    if (!issueIds || issueIds.length === 0) {
      return { updatedCount: 0, issues: [] };
    }

    return this.circuitBreaker.execute(async () => {
      try {
        if (!this.client) {
          throw new Error('MS1 Issues Service is currently unavailable');
        }

        if (this.isCustomStub && typeof this.client.batchUpdateIssueSprint === 'function') {
          const res = this.client.batchUpdateIssueSprint({ issueIds, sprintId });
          if (isObservable(res)) {
            const result = await firstValueFrom(res as Observable<any>);
            return {
              updatedCount: result?.updatedCount ?? result?.updated_count ?? 0,
              issues: (result?.issues || []).map(this.mapProtoIssue),
            };
          }
        }

        const request = { issueIds, issue_ids: issueIds, sprintId, sprint_id: sprintId };

        return await new Promise<BatchUpdateResultDto>((resolve, reject) => {
          const metadata = new grpc.Metadata();
          const deadline = new Date(Date.now() + 5000);

          try {
            const res = this.client.batchUpdateIssueSprint(request, metadata, { deadline }, (err: any, response: any) => {
              if (err) return reject(err);
              resolve({
                updatedCount: response?.updatedCount ?? response?.updated_count ?? 0,
                issues: (response?.issues || []).map(this.mapProtoIssue),
              });
            });

            if (isObservable(res)) {
              firstValueFrom(res as Observable<any>).then(
                (result: any) => {
                  resolve({
                    updatedCount: result?.updatedCount ?? result?.updated_count ?? 0,
                    issues: (result?.issues || []).map(this.mapProtoIssue),
                  });
                },
                (err: any) => reject(err),
              );
            }
          } catch (callErr) {
            reject(callErr);
          }
        });
      } catch (err: any) {
        if (
          err?.code === 14 ||
          err?.code === '14' ||
          String(err?.message || '').includes('unavailable') ||
          String(err?.details || '').includes('unavailable')
        ) {
          throw new Error('MS1 Issues Service is currently unavailable');
        }
        throw err;
      }
    });
  }

  async removeIssuesFromSprint(issueIds: string[]): Promise<number> {
    const result = await this.batchUpdateIssueSprint(issueIds, '');
    return result.updatedCount;
  }

  async moveIssuesToSprint(issueIds: string[], sprintId: string): Promise<number> {
    const result = await this.batchUpdateIssueSprint(issueIds, sprintId);
    return result.updatedCount;
  }

  private mapProtoIssue(item: any): IssueDto {
    return {
      id: item.id || '',
      key: item.key || '',
      projectId: item.projectId || item.project_id || '',
      title: item.title || '',
      description: item.description || '',
      status: Number(item.status || 0),
      priority: Number(item.priority || 0),
      type: Number(item.type || 0),
      storyPoints: Math.max(0, Number(item.storyPoints || item.story_points || 0)),
      sprintId: item.sprintId || item.sprint_id || undefined,
    };
  }
}

/**
 * Direct subclass alias for IssuesGrpcClient expected by DI or tests
 */
@Injectable()
export class IssuesGrpcClient extends IssuesClientService {
  constructor(@Optional() configServiceOrStub?: any, @Optional() stub?: any) {
    if (configServiceOrStub && typeof configServiceOrStub.listIssues === 'function') {
      super(undefined, configServiceOrStub);
    } else {
      super(configServiceOrStub, stub);
    }
  }
}
