import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PaiementsService } from './paiements.service.js';
import { IdempotenceService } from './idempotence.service.js';
import { FournisseurDemoService } from '../fournisseurs/fournisseur-demo.service.js';

describe('PaiementsService', () => {
  let service: PaiementsService;
  let mockPrisma: any;
  let mockPortefeuilleService: any;
  let idempotenceService: IdempotenceService;
  let fournisseurDemo: FournisseurDemoService;
  let mockAbonnementsService: any;

  beforeEach(() => {
    mockPrisma = {
      orm: {
        public: {
          DemandeCollecte: {
            where: vi.fn(),
          },
          Abonnement: {
            where: vi.fn(),
          },
          Facture: {
            where: vi.fn(),
          },
          Paiement: {
            where: vi.fn(),
            create: vi.fn(),
          },
          CleIdempotence: {
            where: vi.fn(),
            create: vi.fn(),
          },
          Utilisateur: {
            where: vi.fn(),
          },
          Entreprise: {
            where: vi.fn(),
          },
        },
      },
      transaction: vi.fn(async (callback) => callback(mockPrisma)),
    };

    mockPortefeuilleService = {
      obtenirPortefeuillePourProprietaire: vi.fn(),
      crediter: vi.fn(),
      debiter: vi.fn(),
    };

    idempotenceService = new IdempotenceService(mockPrisma);
    fournisseurDemo = new FournisseurDemoService();
    mockAbonnementsService = {
      activerAbonnementApresPaiement: vi.fn(),
    };

    service = new PaiementsService(
      mockPrisma,
      mockPortefeuilleService,
      idempotenceService,
      fournisseurDemo,
      mockAbonnementsService,
    );
  });

  describe('payerCollecte', () => {
    it('devrait payer par portefeuille, débiter atomiquement et passer la collecte à PAYEE', async () => {
      mockPrisma.orm.public.DemandeCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 10n,
          numero: 'COL-001',
          utilisateur_id: 5n,
          prix_estime: '2500',
          statut: 'EN_ATTENTE_PAIEMENT',
        }),
        update: vi.fn().mockResolvedValue({
          id: 10n,
          statut: 'PAYEE',
        }),
      });

      mockPortefeuilleService.obtenirPortefeuillePourProprietaire.mockResolvedValue({
        id: 20n,
        solde: '10000',
      });

      mockPrisma.orm.public.Paiement.create.mockResolvedValue({
        id: 101n,
        montant: '2500',
        methode: 'PORTEFEUILLE',
        statut: 'PAYE',
      });

      const res = await service.payerCollecte(
        {
          demande_id: '10',
          methode: 'PORTEFEUILLE',
        },
        { id: 5n, role: 'PARTICULIER' },
      );

      expect(res.succes).toBe(true);
      expect(mockPortefeuilleService.debiter).toHaveBeenCalledWith(
        20n,
        2500,
        expect.stringContaining('Règlement collecte'),
        expect.any(String),
        mockPrisma,
      );
      expect(mockPrisma.orm.public.Paiement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          methode: 'PORTEFEUILLE',
          type: 'COLLECTE',
          statut: 'PAYE',
          montant: '2500',
        }),
      );
    });

    it('devrait initier un paiement externe si la méthode est MTN_MOMO', async () => {
      mockPrisma.orm.public.DemandeCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 10n,
          numero: 'COL-001',
          utilisateur_id: 5n,
          prix_estime: '2500',
          statut: 'EN_ATTENTE_PAIEMENT',
        }),
      });

      mockPrisma.orm.public.Paiement.create.mockResolvedValue({
        id: 102n,
        montant: '2500',
        methode: 'MTN_MOMO',
        statut: 'EN_COURS',
      });

      const res = await service.payerCollecte(
        {
          demande_id: '10',
          methode: 'MTN_MOMO',
          telephone_payeur: '+237670000000',
        },
        { id: 5n, role: 'PARTICULIER' },
      );

      expect(res.succes).toBe(true);
      expect(mockPortefeuilleService.debiter).not.toHaveBeenCalled();
      expect(res.paiement.statut).toBe('EN_COURS');
      expect(res.url_paiement).toBeDefined();
    });
  });

  describe('rechargerPortefeuille', () => {
    it('devrait refuser une recharge avec comme méthode PORTEFEUILLE', async () => {
      await expect(
        service.rechargerPortefeuille(
          {
            montant: 5000,
            methode: 'PORTEFEUILLE' as any,
          },
          { id: 5n, role: 'PARTICULIER' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('devrait initier la recharge externe via Orange Money', async () => {
      mockPrisma.orm.public.Paiement.create.mockResolvedValue({
        id: 103n,
        montant: '5000',
        methode: 'ORANGE_MONEY',
        type: 'RECHARGEMENT_PORTEFEUILLE',
        statut: 'EN_COURS',
      });

      const res = await service.rechargerPortefeuille(
        {
          montant: 5000,
          methode: 'ORANGE_MONEY',
          telephone_payeur: '+237690000000',
        },
        { id: 5n, role: 'PARTICULIER' },
      );

      expect(res.succes).toBe(true);
      expect(res.url_paiement).toBeDefined();
    });
  });

  describe('traiterWebhook', () => {
    it('devrait rejeter un webhook si la signature HMAC est invalide', async () => {
      await expect(
        service.traiterWebhook('demo', 'signature-invalide', {
          reference_paiement: 'PAY-1',
          montant: 2000,
          statut: 'PAYE',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('devrait être strictement idempotent et ne pas re-créditer si déjà PAYE', async () => {
      const payload = {
        reference_paiement: 'PAY-RECH-1',
        montant: 5000,
        statut: 'PAYE',
        reference_fournisseur: 'EXT-999',
      };
      const signature = fournisseurDemo.calculerSignature(payload);

      mockPrisma.orm.public.Paiement.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 104n,
          reference: 'PAY-RECH-1',
          montant: '5000',
          statut: 'PAYE', // Déjà payé !
        }),
      });

      const res = await service.traiterWebhook('demo', signature, payload);

      expect(res.recu).toBe(true);
      expect(res.message).toContain('déjà traitée');
      expect(mockPortefeuilleService.crediter).not.toHaveBeenCalled();
    });

    it('devrait créditer le portefeuille lors de la confirmation d’une recharge', async () => {
      const payload = {
        reference_paiement: 'PAY-RECH-2',
        montant: 5000,
        statut: 'PAYE',
        reference_fournisseur: 'EXT-1000',
      };
      const signature = fournisseurDemo.calculerSignature(payload);

      mockPrisma.orm.public.Paiement.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 105n,
          reference: 'PAY-RECH-2',
          montant: '5000',
          utilisateur_id: 5n,
          type: 'RECHARGEMENT_PORTEFEUILLE',
          statut: 'EN_COURS',
        }),
        update: vi.fn().mockResolvedValue({
          id: 105n,
          statut: 'PAYE',
        }),
      });

      mockPrisma.orm.public.Utilisateur.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 5n, role: 'PARTICULIER' }),
      });

      mockPortefeuilleService.obtenirPortefeuillePourProprietaire.mockResolvedValue({
        id: 25n,
        solde: '1000',
      });

      const res = await service.traiterWebhook('demo', signature, payload);

      expect(res.recu).toBe(true);
      expect(res.statut).toBe('PAYE');
      expect(mockPortefeuilleService.crediter).toHaveBeenCalledWith(
        25n,
        5000,
        expect.stringContaining('Recharge confirmée'),
        expect.any(String),
        mockPrisma,
      );
    });
  });
});

