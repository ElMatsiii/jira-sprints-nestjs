import { Controller, Inject, Optional } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { SprintService, SprintsService } from '../services/sprint.service';
import {
  CreateSprintRequest,
  CreateSprintResponse,
  GetSprintRequest,
  GetSprintResponse,
  ListSprintsRequest,
  ListSprintsResponse,
  StartSprintRequest,
  StartSprintResponse,
  CompleteSprintRequest,
  CompleteSprintResponse,
} from 'jira-contracts/gen/ts';
import { toProtoSprint } from '../dto/sprint.dto';

@Controller()
export class SprintGrpcController {
  private readonly sprintService: SprintService;

  constructor(
    @Optional() @Inject(SprintService) sprintService?: SprintService,
    @Optional() @Inject(SprintsService) sprintsService?: SprintsService,
  ) {
    this.sprintService = sprintService || sprintsService || (sprintService as any);
  }

  @GrpcMethod('SprintService', 'CreateSprint')
  async createSprint(data: CreateSprintRequest | any): Promise<CreateSprintResponse | any> {
    const sprint = await this.sprintService.createSprint(data);
    return { sprint: toProtoSprint(sprint) };
  }

  @GrpcMethod('SprintService', 'GetSprint')
  async getSprint(data: GetSprintRequest | any): Promise<GetSprintResponse | any> {
    const sprint = await this.sprintService.getSprint(data?.id);
    return { sprint: toProtoSprint(sprint) };
  }

  @GrpcMethod('SprintService', 'ListSprints')
  async listSprints(data: ListSprintsRequest | any): Promise<ListSprintsResponse | any> {
    const projectId = data?.projectId ?? data?.project_id;
    const status = data?.status;
    const sprints = await this.sprintService.listSprints(projectId, status);
    return { sprints: sprints.map(toProtoSprint) };
  }

  @GrpcMethod('SprintService', 'StartSprint')
  async startSprint(data: StartSprintRequest | any): Promise<StartSprintResponse | any> {
    const sprint = await this.sprintService.startSprint(data?.id);
    return { sprint: toProtoSprint(sprint) };
  }

  @GrpcMethod('SprintService', 'CompleteSprint')
  async completeSprint(data: CompleteSprintRequest | any): Promise<CompleteSprintResponse | any> {
    const sprint = await this.sprintService.completeSprint(data?.id);
    return { sprint: toProtoSprint(sprint) };
  }
}

/**
 * Direct alias for SprintsController expected by tests or module wiring
 */
@Controller()
export class SprintsController extends SprintGrpcController {}
