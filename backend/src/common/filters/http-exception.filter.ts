import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let message = 'Internal server error';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as any;
        message = resp.message || resp.error || message;
        errorCode = resp.error || errorCode;
        details = resp.details || resp;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled exception: ${exception.message}`, exception.stack);
    }

    // Map status to error code if not set
    if (errorCode === 'INTERNAL_SERVER_ERROR') {
      switch (status) {
        case 400:
          errorCode = 'VALIDATION_ERROR';
          break;
        case 401:
          errorCode = 'UNAUTHORIZED';
          break;
        case 403:
          errorCode = 'FORBIDDEN';
          break;
        case 404:
          errorCode = 'NOT_FOUND';
          break;
        case 409:
          errorCode = 'CONFLICT';
          break;
      }
    }

    const requestId = (request.headers['x-request-id'] as string) || `req_${Date.now()}`;

    response.status(status).json({
      success: false,
      statusCode: status,
      error: errorCode,
      message,
      details,
      timestamp: new Date().toISOString(),
      requestId,
      path: request.url,
    });
  }
}
