import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PaginationQueryDto, validerChampTri } from './pagination-query.dto.js';

describe('PaginationQueryDto', () => {
  it('devrait accepter les valeurs par défaut', async () => {
    const dto = plainToInstance(PaginationQueryDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.page).toBe(1);
    expect(dto.limite).toBe(20);
    expect(dto.offset).toBe(0);
  });

  it('devrait rejeter une limite supérieure à 100', async () => {
    const dto = plainToInstance(PaginationQueryDto, { limite: 150 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints?.max).toBeDefined();
  });

  it('devrait rejeter une page inférieure à 1', async () => {
    const dto = plainToInstance(PaginationQueryDto, { page: 0 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints?.min).toBeDefined();
  });

  it('devrait calculer correctement le décalage (offset)', () => {
    const dto = plainToInstance(PaginationQueryDto, { page: 3, limite: 25 });
    expect(dto.offset).toBe(50);
  });

  describe('validerChampTri', () => {
    it('devrait retourner le champ s\'il est autorisé', () => {
      const resultat = validerChampTri('date_creation', ['date_creation', 'nom'], 'id');
      expect(resultat).toBe('date_creation');
    });

    it('devrait retourner le champ par défaut si le champ n\'est pas autorisé', () => {
      const resultat = validerChampTri('inconnu', ['date_creation', 'nom'], 'id');
      expect(resultat).toBe('id');
    });
  });
});

