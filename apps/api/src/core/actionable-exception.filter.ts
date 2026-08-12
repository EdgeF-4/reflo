import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Keep the public HTTP contract useful when either application code or Nest's
 * validation layer rejects a request. Internal exceptions are not echoed to
 * clients, but every response still identifies a concrete recovery action.
 */
@Catch()
export class ActionableExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ActionableExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : null;
    const detail = status >= 500 ? 'Internal server error' : responseDetail(body);
    const nextAction = nextActionFor(status);
    if (status >= 500) {
      const cause = exception instanceof Error ? exception.stack ?? exception.message : String(exception);
      this.logger.error(
        `request failed unexpectedly. Next: inspect this cause, restore the failed dependency, then retry. Cause: ${cause}`,
      );
    }

    response.status(status).json({
      statusCode: status,
      error: responseLabel(body, status),
      message: /\bNext:/.test(detail)
        ? detail
        : `${detail.replace(/[.\s]+$/, '')}. Next: ${nextAction}`,
      nextAction,
    });
  }
}

function responseDetail(body: string | object | null): string {
  if (typeof body === 'string') return body;
  if (body && 'message' in body) {
    const message = (body as { message?: unknown }).message;
    if (Array.isArray(message)) return message.map(String).join('; ');
    if (typeof message === 'string') return message;
  }
  return 'Request rejected';
}

function responseLabel(body: string | object | null, status: number): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const label = (body as { error?: unknown }).error;
    if (typeof label === 'string') return label;
  }
  return status >= 500 ? 'Internal Server Error' : 'Request Error';
}

export function nextActionFor(status: number): string {
  if (status === HttpStatus.BAD_REQUEST) {
    return 'correct the named request fields, then retry the same route.';
  }
  if (status === HttpStatus.UNAUTHORIZED) {
    return 'sign in at POST /auth/login and send the returned token as Authorization: Bearer <token>.';
  }
  if (status === HttpStatus.FORBIDDEN) {
    return 'use an account with the required role or choose a route allowed for the current account.';
  }
  if (status === HttpStatus.NOT_FOUND) {
    return 'copy a current identifier from the matching list route, then retry.';
  }
  if (status === HttpStatus.CONFLICT) {
    return 'refresh the current resource state before deciding whether to retry.';
  }
  if (status === HttpStatus.TOO_MANY_REQUESTS) {
    return 'wait for the indicated retry window, then retry once.';
  }
  if (status >= 500) {
    return 'run `docker compose ps` and `docker compose logs api`, fix the reported dependency, then retry.';
  }
  return 'check the route, method, and request fields, then retry.';
}
