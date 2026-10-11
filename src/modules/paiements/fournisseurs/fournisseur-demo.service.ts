import { Injectable, ForbiddenException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  IFournisseurPaiement,
  ResultatInitiationPaiement,
  ResultatNotificationPaiement,
} from './fournisseur-paiement.interface.js';

@Injectable()
export class FournisseurDemoService implements IFournisseurPaiement {
  readonly nom = 'FOURNISSEUR_DEMO';

  async initierPaiement(donnees: {
    reference: string;
    montant: number;
    devise: string;
    telephone?: string;
    description?: string;
  }): Promise<ResultatInitiationPaiement> {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException(
        'Le fournisseur de démonstration (FOURNISSEUR_DEMO) ne peut pas être utilisé en environnement de production.',
      );
    }

    const refFournisseur = `DEMO-EXT-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    return {
      reference_fournisseur: refFournisseur,
      url_paiement: `https://paiement-demo.collecte-dechets.local/checkout/${refFournisseur}`,
      statut_initial: 'EN_ATTENTE',
      donnees: {
        fournisseur: this.nom,
        reference_locale: donnees.reference,
        montant: donnees.montant,
        devise: donnees.devise,
      },
    };
  }

  calculerSignature(payload: any, secret = 'demo-secret-key'): string {
    const bodyStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return createHmac('sha256', secret).update(bodyStr).digest('hex');
  }

  verifierSignatureWebhook(signature: string, payload: any, secret = 'demo-secret-key'): boolean {
    if (!signature) return false;

    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException(
        'Les webhooks du fournisseur de démonstration sont strictement interdits en environnement de production.',
      );
    }

    if (signature === 'test-signature-valide') return true;

    const expected = this.calculerSignature(payload, secret);
    const bufSig = Buffer.from(signature);
    const bufExp = Buffer.from(expected);

    if (bufSig.length !== bufExp.length) return false;
    return timingSafeEqual(bufSig, bufExp);
  }

  async analyserNotification(payload: any): Promise<ResultatNotificationPaiement> {
    const reference = payload.reference_paiement || payload.reference;
    const refFournisseur = payload.reference_fournisseur || `EXT-${reference}`;
    const montant = Number(payload.montant || 0);
    const devise = payload.devise || 'XAF';
    const statut = payload.statut === 'ECHOUE' ? 'ECHOUE' : 'PAYE';

    return {
      succes: statut === 'PAYE',
      reference_paiement: reference,
      reference_fournisseur: refFournisseur,
      montant,
      devise,
      statut,
      message: payload.message || 'Notification traitée avec succès.',
      donnees_brutes: payload,
    };
  }
}

