import { describe, it, expect } from 'vitest';
import { of } from 'rxjs';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { TransformInterceptor } from './transform.interceptor.js';

describe('TransformInterceptor', () => {
  const interceptor = new TransformInterceptor();

  const mockContext = {} as ExecutionContext;

  it('devrait formater une réponse brute dans le format standard', async () => {
    const mockCallHandler: CallHandler = {
      handle: () => of({ foo: 'bar' }),
    };

    const observable = interceptor.intercept(mockContext, mockCallHandler);
    observable.subscribe((result) => {
      expect(result).toEqual({
        success: true,
        message: 'Opération effectuée avec succès.',
        data: { foo: 'bar' },
      });
    });
  });

  it('devrait préserver une réponse déjà au format standard avec son message', async () => {
    const mockCallHandler: CallHandler = {
      handle: () =>
        of({
          success: true,
          message: 'Message spécifique.',
          data: { id: 1 },
        }),
    };

    const observable = interceptor.intercept(mockContext, mockCallHandler);
    observable.subscribe((result) => {
      expect(result).toEqual({
        success: true,
        message: 'Message spécifique.',
        data: { id: 1 },
      });
    });
  });

  it('devrait renvoyer un objet data vide si la valeur est null ou undefined', async () => {
    const mockCallHandler: CallHandler = {
      handle: () => of(null),
    };

    const observable = interceptor.intercept(mockContext, mockCallHandler);
    observable.subscribe((result) => {
      expect(result).toEqual({
        success: true,
        message: 'Opération effectuée avec succès.',
        data: {},
      });
    });
  });
});

