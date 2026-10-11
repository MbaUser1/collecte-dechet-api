import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Une erreur interne est survenue.';
    let code = 'INTERNAL_SERVER_ERROR';
    let data: unknown = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
        code = HttpStatus[status] ?? 'HTTP_ERROR';
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        code = (resObj.error as string) || (resObj.code as string) || HttpStatus[status] || 'HTTP_ERROR';

        if (Array.isArray(resObj.message)) {
          message = resObj.message.join(', ');
          data = { erreurs: resObj.message };
          code = 'VALIDATION_ERROR';
        } else if (typeof resObj.message === 'string') {
          message = resObj.message;
        } else {
          message = exception.message;
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Exception non gérée: ${exception.message}`, exception.stack);
      if (process.env.NODE_ENV !== 'production') {
        message = exception.message;
      }
    }

    // Assainissement strict en environnement de production
    if (process.env.NODE_ENV === 'production') {
      if (status >= 500) {
        message = 'Une erreur interne est survenue.';
        data = {};
      } else if (typeof message === 'string') {
        if (
          message.includes('postgres://') ||
          message.includes('postgresql://') ||
          message.includes('password=') ||
          message.includes('Bearer ')
        ) {
          message = 'Une erreur est survenue lors du traitement de la requête.';
        }
      }
    }

    response.status(status).json({
      success: false,
      message,
      code,
      data,
    });
  }
}

