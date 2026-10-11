export interface ResultatInitiationPaiement {
  reference_fournisseur: string;
  url_paiement?: string;
  statut_initial: 'EN_ATTENTE' | 'EN_COURS';
  donnees?: Record<string, unknown>;
}

export interface ResultatNotificationPaiement {
  succes: boolean;
  reference_paiement: string;
  reference_fournisseur: string;
  montant: number;
  devise: string;
  statut: 'PAYE' | 'ECHOUE';
  message?: string;
  donnees_brutes?: Record<string, unknown>;
}

export interface IFournisseurPaiement {
  readonly nom: string;

  initierPaiement(donnees: {
    reference: string;
    montant: number;
    devise: string;
    telephone?: string;
    description?: string;
  }): Promise<ResultatInitiationPaiement>;

  verifierSignatureWebhook(signature: string, payload: any, secret?: string): boolean;

  analyserNotification(payload: any): Promise<ResultatNotificationPaiement>;
}

