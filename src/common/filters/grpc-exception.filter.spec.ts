import { GrpcExceptionFilter } from './grpc-exception.filter';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import {
  SprintNotFoundException,
  ActiveSprintExistsException,
  InvalidSprintStateException,
  InvalidArgumentException,
  ServiceUnavailableException,
} from '../exceptions/domain.exceptions';
import { firstValueFrom } from 'rxjs';

describe('GrpcExceptionFilter', () => {
  let filter: GrpcExceptionFilter;

  beforeEach(() => {
    filter = new GrpcExceptionFilter();
  });

  it('should map SprintNotFoundException to NOT_FOUND (5)', async () => {
    const error$ = filter.catch(new SprintNotFoundException('sprint-1'));
    await expect(firstValueFrom(error$)).rejects.toEqual(
      expect.objectContaining({
        code: status.NOT_FOUND,
      }),
    );
  });

  it('should map InvalidArgumentException to INVALID_ARGUMENT (3)', async () => {
    const error$ = filter.catch(new InvalidArgumentException('Invalid date'));
    await expect(firstValueFrom(error$)).rejects.toEqual(
      expect.objectContaining({
        code: status.INVALID_ARGUMENT,
      }),
    );
  });

  it('should map ActiveSprintExistsException to FAILED_PRECONDITION (9)', async () => {
    const error$ = filter.catch(new ActiveSprintExistsException('proj-1'));
    await expect(firstValueFrom(error$)).rejects.toEqual(
      expect.objectContaining({
        code: status.FAILED_PRECONDITION,
      }),
    );
  });

  it('should map InvalidSprintStateException to FAILED_PRECONDITION (9)', async () => {
    const error$ = filter.catch(new InvalidSprintStateException('State invalid'));
    await expect(firstValueFrom(error$)).rejects.toEqual(
      expect.objectContaining({
        code: status.FAILED_PRECONDITION,
      }),
    );
  });

  it('should map ServiceUnavailableException to UNAVAILABLE (14)', async () => {
    const error$ = filter.catch(new ServiceUnavailableException('MS1 down'));
    await expect(firstValueFrom(error$)).rejects.toEqual(
      expect.objectContaining({
        code: status.UNAVAILABLE,
      }),
    );
  });

  it('should map PostgreSQL 23505 unique violation to FAILED_PRECONDITION (9)', async () => {
    const error$ = filter.catch({ code: '23505', message: 'duplicate key' });
    await expect(firstValueFrom(error$)).rejects.toEqual(
      expect.objectContaining({
        code: status.FAILED_PRECONDITION,
        message: 'Active sprint already exists for this project',
      }),
    );
  });

  it('should map unknown error to INTERNAL (13)', async () => {
    const error$ = filter.catch(new Error('Unexpected database failure'));
    await expect(firstValueFrom(error$)).rejects.toEqual(
      expect.objectContaining({
        code: status.INTERNAL,
      }),
    );
  });

  it('should pass through RpcException with object error', async () => {
    const rpcErr = new RpcException({ code: status.ALREADY_EXISTS, message: 'Already exists' });
    const error$ = filter.catch(rpcErr);
    await expect(firstValueFrom(error$)).rejects.toEqual({
      code: status.ALREADY_EXISTS,
      message: 'Already exists',
    });
  });
});
