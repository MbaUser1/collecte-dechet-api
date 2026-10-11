import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { CalculTarifService } from './calcul-tarif.service.js';

describe('CalculTarifService', () => {
  const service = new CalculTarifService();

  const tarifStandard = {
    prix_base: 1000,
    prix_par_kg: 50,
    prix_par_km: 100,
    prix_minimum: 2500,
  };

  it('devrait calculer le prix selon la formule exacte (prix_base + poids * prix_kg + distance * prix_km + suppléments)', () => {
    // 1000 + (40 * 50 = 2000) + (10 * 100 = 1000) + 500 = 4500
    const resultat = service.calculerPrix({
      ...tarifStandard,
      poids_kg: 40,
      distance_km: 10,
      supplements_cfa: 500,
    });

    expect(resultat.prix_base).toBe(1000);
    expect(resultat.prix_poids).toBe(2000);
    expect(resultat.prix_distance).toBe(1000);
    expect(resultat.supplements).toBe(500);
    expect(resultat.prix_brut).toBe(4500);
    expect(resultat.prix_final).toBe(4500);
    expect(resultat.details.minimum_applique).toBe(false);
    expect(resultat.devise).toBe('XAF');
  });

  it('devrait appliquer le prix minimum lorsque le prix calculé brut est inférieur', () => {
    // 1000 + (5 * 50 = 250) + (2 * 100 = 200) + 0 = 1450 < 2500 (prix minimum)
    const resultat = service.calculerPrix({
      ...tarifStandard,
      poids_kg: 5,
      distance_km: 2,
    });

    expect(resultat.prix_brut).toBe(1450);
    expect(resultat.prix_minimum).toBe(2500);
    expect(resultat.prix_final).toBe(2500);
    expect(resultat.details.minimum_applique).toBe(true);
  });

  it('devrait rejeter un poids négatif', () => {
    expect(() =>
      service.calculerPrix({
        ...tarifStandard,
        poids_kg: -5,
        distance_km: 10,
      }),
    ).toThrow(BadRequestException);
  });

  it('devrait rejeter une distance négative', () => {
    expect(() =>
      service.calculerPrix({
        ...tarifStandard,
        poids_kg: 10,
        distance_km: -2,
      }),
    ).toThrow(BadRequestException);
  });

  it('devrait rejeter des suppléments négatifs', () => {
    expect(() =>
      service.calculerPrix({
        ...tarifStandard,
        poids_kg: 10,
        distance_km: 2,
        supplements_cfa: -100,
      }),
    ).toThrow(BadRequestException);
  });

  it('devrait rejeter des paramètres tarifaires négatifs', () => {
    expect(() =>
      service.calculerPrix({
        prix_base: -100,
        prix_par_kg: 50,
        prix_par_km: 100,
        prix_minimum: 1000,
        poids_kg: 10,
      }),
    ).toThrow(BadRequestException);
  });
});

