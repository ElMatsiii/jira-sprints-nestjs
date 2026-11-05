import { Catch, RpcExceptionFilter, ArgumentsHost, Logger } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import {
  SprintNotFoundException,
  ActiveSprintExistsException,
  InvalidSprintStateException,
  SprintValidationException,
  InvalidArgumentException,
  ServiceUnavailableException,
} from '../exceptions/domain.exceptions';

@Catch()
export class GrpcExceptionFilter implements RpcExceptionFilter<any> {
  private readonly logger = new Logger(GrpcExceptionFilter.name);

  catch(exception: any, host?: ArgumentsHost): Observable<any> {
    const errorMsg = exception?.message || String(exception);
    this.logger.error(`Handling exception: ${errorMsg}`);

    if (exception instanceof RpcException) {
      const err = exception.getError();
      if (typeof err === 'object' && err !== null && (err as any).code !== undefined) {
        return throwError(() => err);
      }
      return throwError(() => ({
        code: status.INTERNAL,
        message: typeof err === 'string' ? err : errorMsg,
      }));
    }

    let code: number = status.INTERNAL;
    let message: string = errorMsg;

    if (exception instanceof SprintNotFoundException) {
      code = status.NOT_FOUND;
    } else if (
      exception instanceof InvalidArgumentException ||
      exception instanceof SprintValidationException
    ) {
      code = status.INVALID_ARGUMENT;
    } else if (exception instanceof InvalidSprintStateException) {
      code = status.FAILED_PRECONDITION;
    } else if (exception instanceof ActiveSprintExistsException) {
      code = status.FAILED_PRECONDITION;
    } else if (exception instanceof ServiceUnavailableException) {
      code = status.UNAVAILABLE;
    } else if (exception?.code === '23505') {
      // PostgreSQL unique constraint violation
      code = status.FAILED_PRECONDITION;
      message = 'Active sprint already exists for this project';
    } else if (typeof exception?.code === 'number' && exception.code >= 0 && exception.code <= 16) {
      code = exception.code;
    }

    return throwError(() => ({
      code,
      message,
    }));
  }
}
