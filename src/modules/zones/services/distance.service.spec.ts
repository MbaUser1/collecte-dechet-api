import { describe, it, expect } from 'vitest';
import { DistanceService } from './distance.service.js';

describe('DistanceService', () => {
  const service = new DistanceService();

  it('devrait retourner 0 km pour deux points identiques', () => {
    const point = { latitude: 4.0511, longitude: 9.7679 }; // Douala
    const distance = service.calculerDistanceKm(point, point);
    expect(distance).toBe(0);
  });

  it('devrait calculer correctement la distance entre deux villes (Douala -> Yaoundé ~200-220 km)', () => {
    const douala = { latitude: 4.0511, longitude: 9.7679 };
    const yaounde = { latitude: 3.848, longitude: 11.5021 };

    const distance = service.calculerDistanceKm(douala, yaounde);

    // Distance orthodromique entre Douala et Yaoundé est d'environ 194-205 km
    expect(distance).toBeGreaterThan(190);
    expect(distance).toBeLessThan(215);
  });

  it('devrait arrondir à 2 décimales', () => {
    const p1 = { latitude: 4.05, longitude: 9.76 };
    const p2 = { latitude: 4.06, longitude: 9.77 };

    const distance = service.calculerDistanceKm(p1, p2);
    const decimales = distance.toString().split('.')[1];
    if (decimales) {
      expect(decimales.length).toBeLessThanOrEqual(2);
    }
  });
});

