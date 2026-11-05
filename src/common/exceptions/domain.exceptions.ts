import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';

export class DomainException extends RpcException {
  public readonly code: number;

  constructor(error: string | { code: number; message: string }, defaultCode: number = status.INTERNAL) {
    const errorObj =
      typeof error === 'string'
        ? { code: defaultCode, message: error }
        : { code: error?.code ?? defaultCode, message: error?.message ?? 'Domain error' };

    super(errorObj);
    this.name = this.constructor.name;
    this.code = errorObj.code;
    this.message = errorObj.message;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SprintNotFoundException extends DomainException {
  constructor(id: string) {
    super({ code: status.NOT_FOUND, message: `Sprint with ID "${id}" was not found` }, status.NOT_FOUND);
  }
}

export class ActiveSprintExistsException extends DomainException {
  constructor(projectId: string, activeSprintId?: string) {
    const detail = activeSprintId ? ` ("${activeSprintId}")` : '';
    super(
      {
        code: status.FAILED_PRECONDITION,
        message: `Project "${projectId}" already has an active sprint${detail}. Only one active sprint is allowed per project.`,
      },
      status.FAILED_PRECONDITION,
    );
  }
}

export class InvalidSprintStateException extends DomainException {
  constructor(message: string) {
    super({ code: status.FAILED_PRECONDITION, message }, status.FAILED_PRECONDITION);
  }
}

export class SprintValidationException extends DomainException {
  constructor(message: string) {
    super({ code: status.INVALID_ARGUMENT, message }, status.INVALID_ARGUMENT);
  }
}

export class InvalidArgumentException extends DomainException {
  constructor(message: string) {
    super({ code: status.INVALID_ARGUMENT, message }, status.INVALID_ARGUMENT);
  }
}

export class ServiceUnavailableException extends DomainException {
  constructor(message: string) {
    super({ code: status.UNAVAILABLE, message }, status.UNAVAILABLE);
  }
}
