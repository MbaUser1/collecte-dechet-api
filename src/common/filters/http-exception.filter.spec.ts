import { describe, it, expect, vi } from 'vitest';
import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter.js';

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it('devrait formater une HttpException dans le format uniforme', () => {
    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ json: jsonMock });

    const mockHost = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusMock }),
        getRequest: () => ({}),
      }),
    } as unknown as ArgumentsHost;

    const exception = new HttpException('Ressource introuvable', HttpStatus.NOT_FOUND);

    filter.catch(exception, mockHost);

    expect(statusMock).toHaveBeenCalledWith(404);
    expect(jsonMock).toHaveBeenCalledWith({
      success: false,
      message: 'Ressource introuvable',
      code: 'NOT_FOUND',
      data: {},
    });
  });

  it('devrait formater les erreurs de validation class-validator', () => {
    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ json: jsonMock });

    const mockHost = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusMock }),
        getRequest: () => ({}),
      }),
    } as unknown as ArgumentsHost;

    const exception = new HttpException(
      {
        message: ['Le nom est obligatoire', 'Le prix doit être positif'],
        error: 'Bad Request',
      },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockHost);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({
      success: false,
      message: 'Le nom est obligatoire, Le prix doit être positif',
      code: 'VALIDATION_ERROR',
      data: {
        erreurs: ['Le nom est obligatoire', 'Le prix doit être positif'],
      },
    });
  });
});

