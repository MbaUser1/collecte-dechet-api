import { Injectable } from '@nestjs/common';

export interface CoordonneesGps {
  latitude: number;
  longitude: number;
}

export interface IDistanceCalculator {
  calculerDistanceKm(depart: CoordonneesGps, arrivee: CoordonneesGps): Promise<number> | number;
}

@Injectable()
export class DistanceService implements IDistanceCalculator {
  /**
   * Calcule la distance orthodromique (vol d'oiseau) entre deux coordonnées GPS
   * en utilisant la formule de Haversine (Rayon terrestre moyen = 6371 km).
   *
   * Cette implémentation locale sert de référence par défaut et prépare
   * le branchement transparent d'un fournisseur d'itinéraires externe (OSRM, Google Maps, Mapbox).
   */
  calculerDistanceKm(depart: CoordonneesGps, arrivee: CoordonneesGps): number {
    const R = 6371; // Rayon de la Terre en kilomètres
    const dLat = this.degresVersRadians(arrivee.latitude - depart.latitude);
    const dLon = this.degresVersRadians(arrivee.longitude - depart.longitude);

    const lat1 = this.degresVersRadians(depart.latitude);
    const lat2 = this.degresVersRadians(arrivee.latitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    // Arrondi à deux décimales (ex: 4.25 km)
    return Math.round(distance * 100) / 100;
  }

  private degresVersRadians(degres: number): number {
    return degres * (Math.PI / 180);
  }
}

