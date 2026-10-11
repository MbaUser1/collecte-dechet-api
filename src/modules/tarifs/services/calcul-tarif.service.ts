import { Injectable, BadRequestException } from '@nestjs/common';

export interface ParametresCalculTarif {
  prix_base: number;
  prix_par_kg: number;
  prix_par_km: number;
  prix_minimum: number;
  poids_kg: number;
  distance_km?: number;
  supplements_cfa?: number;
}

export interface ResultatCalculTarif {
  prix_base: number;
  prix_poids: number;
  prix_distance: number;
  supplements: number;
  prix_brut: number;
  prix_minimum: number;
  prix_final: number;
  devise: 'XAF';
  details: {
    poids_kg: number;
    prix_par_kg: number;
    distance_km: number;
    prix_par_km: number;
    minimum_applique: boolean;
  };
}

@Injectable()
export class CalculTarifService {
  /**
   * Calcule le prix officiel d'une collecte à partir du barème tarifaire validé.
   *
   * Formule métier :
   *   prix_brut = prix_base + (poids_kg * prix_par_kg) + (distance_km * prix_par_km) + supplements
   *   prix_final = max(prix_brut, prix_minimum)
   *
   * Rejette systématiquement les valeurs négatives ou incohérentes.
   */
  calculerPrix(params: ParametresCalculTarif): ResultatCalculTarif {
    const prixBase = Number(params.prix_base);
    const prixParKg = Number(params.prix_par_kg);
    const prixParKm = Number(params.prix_par_km);
    const prixMinimum = Number(params.prix_minimum);
    const poidsKg = Number(params.poids_kg);
    const distanceKm = Number(params.distance_km ?? 0);
    const supplements = Number(params.supplements_cfa ?? 0);

    // 1. Validation de non-négativité
    if (prixBase < 0 || prixParKg < 0 || prixParKm < 0 || prixMinimum < 0) {
      throw new BadRequestException('Les paramètres tarifaires ne peuvent pas être négatifs.');
    }

    if (poidsKg < 0) {
      throw new BadRequestException('Le poids en kilogrammes ne peut pas être négatif.');
    }

    if (distanceKm < 0) {
      throw new BadRequestException('La distance en kilomètres ne peut pas être négative.');
    }

    if (supplements < 0) {
      throw new BadRequestException('Les suppléments tarifaires ne peuvent pas être négatifs.');
    }

    // 2. Application de la formule
    const prixPoids = Math.round(poidsKg * prixParKg * 100) / 100;
    const prixDistance = Math.round(distanceKm * prixParKm * 100) / 100;
    const prixBrut = Math.round((prixBase + prixPoids + prixDistance + supplements) * 100) / 100;

    const minimumApplique = prixBrut < prixMinimum;
    const prixFinal = minimumApplique ? prixMinimum : prixBrut;

    return {
      prix_base: prixBase,
      prix_poids: prixPoids,
      prix_distance: prixDistance,
      supplements,
      prix_brut: prixBrut,
      prix_minimum: prixMinimum,
      prix_final: prixFinal,
      devise: 'XAF',
      details: {
        poids_kg: poidsKg,
        prix_par_kg: prixParKg,
        distance_km: distanceKm,
        prix_par_km: prixParKm,
        minimum_applique: minimumApplique,
      },
    };
  }
}

