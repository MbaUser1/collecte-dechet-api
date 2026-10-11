import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MissionsService } from './missions.service.js';
import { CalculTarifService } from '../tarifs/services/calcul-tarif.service.js';

describe('MissionsService', () => {
  let service: MissionsService;
  let mockPrisma: any;
  let calculTarifService: CalculTarifService;
  let mockTarifsService: any;
  let mockQuotaService: any;
  let mockAjustementsService: any;

  beforeEach(() => {
    mockPrisma = {
      orm: {
        public: {
          DemandeCollecte: {
            where: vi.fn(),
            update: vi.fn(),
          },
          MissionCollecte: {
            where: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
          },
          ElementCollecte: {
            where: vi.fn(),
            create: vi.fn(),
          },
          PointCollecte: {
            where: vi.fn(),
          },
          TypeDechet: {
            where: vi.fn(),
          },
          Zone: {
            where: vi.fn(),
          },
          Paiement: {
            where: vi.fn(),
          },
        },
      },
      transaction: vi.fn(async (cb) => cb(mockPrisma)),
    };

    calculTarifService = new CalculTarifService();
    mockTarifsService = {
      obtenirTarifApplicable: vi.fn(),
    };
    mockQuotaService = {
      consommerQuota: vi.fn(),
      libererQuota: vi.fn(),
    };
    mockAjustementsService = {
      creerAjustementDebit: vi.fn(),
      creerAjustementCreditEtRembourser: vi.fn(),
    };

    service = new MissionsService(
      mockPrisma,
      calculTarifService,
      mockTarifsService,
      mockQuotaService,
      mockAjustementsService,
    );
  });

  describe('1. Disponibilité et Attribution', () => {
    it('devrait lister uniquement les demandes en attente d’attribution et non affectées', async () => {
      const mockQuery = {
        where: vi.fn().mockReturnThis(),
        count: vi.fn().mockResolvedValue(1),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue([
          {
            id: 10n,
            numero: 'COL-001',
            ville: 'Douala',
            quartier: 'Akwa',
            adresse: 'Rue 12',
            poids_estime: '15',
            statut: 'EN_ATTENTE_ATTRIBUTION',
            collecteur_id: null,
          },
        ]),
      };

      mockPrisma.orm.public.DemandeCollecte.where.mockReturnValue(mockQuery);

      const resultat = await service.listerCollectesDisponibles({
        page: 1,
        limite: 10,
        offset: 0,
      });

      expect(resultat.elements.length).toBe(1);
      expect(resultat.elements[0].numero).toBe('COL-001');
      expect(mockPrisma.orm.public.DemandeCollecte.where).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });

    it('devrait attribuer atomiquement une collecte disponible et créer la mission', async () => {
      mockPrisma.orm.public.DemandeCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 10n,
          statut: 'EN_ATTENTE_ATTRIBUTION',
          collecteur_id: null,
        }),
        update: vi.fn().mockResolvedValue({
          id: 10n,
          statut: 'ATTRIBUEE',
          collecteur_id: 100n,
        }),
      });

      mockPrisma.orm.public.MissionCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null), // Aucune mission existante
      });

      mockPrisma.orm.public.MissionCollecte.create.mockResolvedValue({
        id: 1n,
        demande_collecte_id: 10n,
        collecteur_id: 100n,
        statut: 'ATTRIBUEE',
      });

      const res = await service.accepterCollecte(10n, { id: 100n, role: 'COLLECTEUR' });

      expect(res.succes).toBe(true);
      expect(res.mission.statut).toBe('ATTRIBUEE');
      expect(mockPrisma.orm.public.DemandeCollecte.where().update).toHaveBeenCalledWith(
        expect.objectContaining({
          collecteur_id: 100n,
          statut: 'ATTRIBUEE',
        }),
      );
    });

    it('devrait rejeter avec COLLECTE_DEJA_ATTRIBUEE si un autre collecteur l’a déjà acceptée', async () => {
      mockPrisma.orm.public.DemandeCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 10n,
          statut: 'ATTRIBUEE', // Déjà prise !
          collecteur_id: 99n,
        }),
      });

      try {
        await service.accepterCollecte(10n, { id: 100n, role: 'COLLECTEUR' });
        expect.fail('Aurait dû lever une ConflictException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ConflictException);
        expect(err.getResponse().code).toBe('COLLECTE_DEJA_ATTRIBUEE');
      }
    });

    it('devrait refuser si le compte utilisateur n’a pas le rôle COLLECTEUR', async () => {
      await expect(
        service.accepterCollecte(10n, { id: 100n, role: 'PARTICULIER' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('2. QR Code et Démarrage de Mission', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';

    it('devrait démarrer la mission avec un QR code valide et des coordonnées GPS correctes', async () => {
      mockPrisma.orm.public.MissionCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          collecteur_id: 100n,
          statut: 'ATTRIBUEE',
          demande_collecte_id: 10n,
          jeton_qr: validUuid,
        }),
        update: vi.fn().mockResolvedValue({
          id: 1n,
          statut: 'EN_COURS',
        }),
      });

      mockPrisma.orm.public.DemandeCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 10n }),
        update: vi.fn().mockResolvedValue({ id: 10n, statut: 'EN_COURS' }),
      });

      const res = await service.scannerQrEtDemarrer(
        1n,
        {
          jeton_qr: validUuid,
          latitude: 4.05,
          longitude: 9.7,
        },
        100n,
      );

      expect(res.succes).toBe(true);
      expect(res.mission.statut).toBe('EN_COURS');
    });

    it('devrait refuser si les coordonnées GPS sont hors bornes', async () => {
      await expect(
        service.scannerQrEtDemarrer(
          1n,
          {
            jeton_qr: validUuid,
            latitude: 150, // Invalide (> 90)
            longitude: 9.7,
          },
          100n,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('devrait refuser avec QR_NON_CORRESPONDANT si le jeton ne correspond pas', async () => {
      mockPrisma.orm.public.MissionCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          collecteur_id: 100n,
          statut: 'ATTRIBUEE',
          demande_collecte_id: 10n,
          jeton_qr: validUuid,
        }),
      });

      mockPrisma.orm.public.DemandeCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 10n, point_collecte_id: null }),
      });

      try {
        await service.scannerQrEtDemarrer(
          1n,
          {
            jeton_qr: '999e4567-e89b-12d3-a456-426614174999',
            latitude: 4.05,
            longitude: 9.7,
          },
          100n,
        );
        expect.fail('Aurait dû lever QR_NON_CORRESPONDANT');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.getResponse().code).toBe('QR_NON_CORRESPONDANT');
      }
    });

    it('devrait refuser avec QR_DEJA_SCANE si la mission est déjà EN_COURS', async () => {
      mockPrisma.orm.public.MissionCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          collecteur_id: 100n,
          statut: 'EN_COURS', // Déjà démarrée
          jeton_qr: validUuid,
        }),
      });

      try {
        await service.scannerQrEtDemarrer(
          1n,
          {
            jeton_qr: validUuid,
            latitude: 4.05,
            longitude: 9.7,
          },
          100n,
        );
        expect.fail('Aurait dû lever QR_DEJA_SCANE');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ConflictException);
        expect(err.getResponse().code).toBe('QR_DEJA_SCANE');
      }
    });

    it('devrait interdire à un collecteur de démarrer la mission d’un tiers', async () => {
      mockPrisma.orm.public.MissionCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          collecteur_id: 50n, // Appartient à un autre collecteur !
        }),
      });

      await expect(
        service.scannerQrEtDemarrer(
          1n,
          {
            jeton_qr: validUuid,
            latitude: 4.05,
            longitude: 9.7,
          },
          100n,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('3. Enregistrement de la Collecte et Finances', () => {
    const detailsPrixSnapshot = JSON.stringify({
      prix_base: 1000,
      prix_par_kg: 100,
      prix_par_km: 50,
      prix_minimum: 1500,
      supplements: 0,
      details: {
        prix_par_kg: 100,
        prix_par_km: 50,
        distance_km: 10,
      },
    });

    it('devrait calculer le prix final et créer un ajustement débiteur si surpoids hors abonnement', async () => {
      // 10kg estimés (prix_estime = 1000 + 10*100 + 10*50 = 2500)
      // 15kg réels -> prix_final = 1000 + 15*100 + 10*50 = 3000
      // Surpoids = 5kg -> écart = +500 FCFA
      mockPrisma.orm.public.MissionCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          collecteur_id: 100n,
          statut: 'EN_COURS',
          demande_collecte_id: 10n,
        }),
        update: vi.fn().mockResolvedValue({ id: 1n, statut: 'TERMINEE' }),
      });

      mockPrisma.orm.public.DemandeCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 10n,
          poids_estime: '10',
          prix_estime: '2500',
          details_prix: detailsPrixSnapshot,
          abonnement_id: null, // Hors abonnement
        }),
        update: vi.fn().mockResolvedValue({ id: 10n, statut: 'TERMINEE' }),
      });

      mockAjustementsService.creerAjustementDebit.mockResolvedValue({
        id: 5n,
        montant: '500',
        sens: 'DEBIT',
        statut: 'EN_ATTENTE',
      });

      const res = await service.enregistrerCollecte(
        1n,
        {
          poids_reel_total: 15,
          tri_respecte: true,
        },
        100n,
      );

      expect(res.succes).toBe(true);
      expect(res.prix_final).toBe(3000);
      expect(mockAjustementsService.creerAjustementDebit).toHaveBeenCalledWith(
        10n,
        500,
        expect.stringContaining('Complément surpoids'),
        expect.anything(),
      );
    });

    it('devrait rembourser sur le portefeuille si le poids réel est inférieur à l’estimation', async () => {
      // 10kg estimés (2500 FCFA)
      // 5kg réels -> prix_final = 1000 + 5*100 + 10*50 = 2000 FCFA
      // Écart = -500 FCFA à rembourser
      mockPrisma.orm.public.MissionCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          collecteur_id: 100n,
          statut: 'EN_COURS',
          demande_collecte_id: 10n,
        }),
        update: vi.fn().mockResolvedValue({ id: 1n, statut: 'TERMINEE' }),
      });

      mockPrisma.orm.public.DemandeCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 10n,
          poids_estime: '10',
          prix_estime: '2500',
          details_prix: detailsPrixSnapshot,
          abonnement_id: null,
        }),
        update: vi.fn().mockResolvedValue({ id: 10n, statut: 'TERMINEE' }),
      });

      mockPrisma.orm.public.Paiement.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 99n, montant: '2500', statut: 'PAYE' }),
      });

      const res = await service.enregistrerCollecte(
        1n,
        {
          poids_reel_total: 5,
          tri_respecte: true,
        },
        100n,
      );

      expect(res.succes).toBe(true);
      expect(res.prix_final).toBe(2000);
      expect(mockAjustementsService.creerAjustementCreditEtRembourser).toHaveBeenCalledWith(
        10n,
        500,
        expect.stringContaining('Remboursement'),
        99n,
        expect.anything(),
      );
    });

    it('devrait consommer le quota d’abonnement sans créer d’ajustement tarifaire de base', async () => {
      mockPrisma.orm.public.MissionCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          collecteur_id: 100n,
          statut: 'EN_COURS',
          demande_collecte_id: 10n,
        }),
        update: vi.fn().mockResolvedValue({ id: 1n, statut: 'TERMINEE' }),
      });

      mockPrisma.orm.public.DemandeCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 10n,
          poids_estime: '10',
          prix_estime: '0',
          details_prix: detailsPrixSnapshot,
          abonnement_id: 42n, // Couverte par abonnement !
        }),
        update: vi.fn().mockResolvedValue({ id: 10n, statut: 'TERMINEE' }),
      });

      const res = await service.enregistrerCollecte(
        1n,
        {
          poids_reel_total: 10,
          tri_respecte: true,
        },
        100n,
      );

      expect(res.succes).toBe(true);
      expect(mockQuotaService.consommerQuota).toHaveBeenCalledWith(10n, expect.anything());
      expect(mockAjustementsService.creerAjustementDebit).not.toHaveBeenCalled();
      expect(mockAjustementsService.creerAjustementCreditEtRembourser).not.toHaveBeenCalled();
    });

    it('devrait rejeter si la somme des éléments ne correspond pas au poids réel total', async () => {
      mockPrisma.orm.public.MissionCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          collecteur_id: 100n,
          statut: 'EN_COURS',
          demande_collecte_id: 10n,
        }),
      });

      mockPrisma.orm.public.TypeDechet.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 1n, statut: 'ACTIF' }),
      });

      try {
        await service.enregistrerCollecte(
          1n,
          {
            poids_reel_total: 20, // Total déclaré: 20kg
            elements: [
              { type_dechet_id: 1, poids: 10 },
              { type_dechet_id: 2, poids: 5 }, // Somme = 15kg != 20kg
            ],
          },
          100n,
        );
        expect.fail('Aurait dû lever INCOHERENCE_POIDS_ELEMENTS');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.getResponse().code).toBe('INCOHERENCE_POIDS_ELEMENTS');
      }
    });

    it('devrait être idempotent si la collecte est déjà TERMINEE', async () => {
      mockPrisma.orm.public.MissionCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          collecteur_id: 100n,
          statut: 'TERMINEE', // Déjà finalisée !
        }),
      });

      const res = await service.enregistrerCollecte(
        1n,
        {
          poids_reel_total: 15,
        },
        100n,
      );

      expect(res.succes).toBe(true);
      expect(mockQuotaService.consommerQuota).not.toHaveBeenCalled();
      expect(mockAjustementsService.creerAjustementDebit).not.toHaveBeenCalled();
    });
  });

  describe('4. Déclaration d’Échec', () => {
    it('devrait déclarer la mission ECHOUEE et libérer le quota réservé', async () => {
      mockPrisma.orm.public.MissionCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          collecteur_id: 100n,
          statut: 'EN_COURS',
          demande_collecte_id: 10n,
        }),
        update: vi.fn().mockResolvedValue({ id: 1n, statut: 'ECHOUEE' }),
      });

      mockPrisma.orm.public.DemandeCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 10n,
          abonnement_id: 42n,
        }),
        update: vi.fn().mockResolvedValue({ id: 10n, statut: 'ECHOUEE' }),
      });

      const res = await service.declarerEchec(
        1n,
        { motif: 'CLIENT_ABSENT', notes: 'Portail fermé à clé' },
        100n,
      );

      expect(res.succes).toBe(true);
      expect(mockQuotaService.libererQuota).toHaveBeenCalledWith(10n, expect.anything());
    });

    it('devrait refuser de déclarer échouée une mission déjà terminée', async () => {
      mockPrisma.orm.public.MissionCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          collecteur_id: 100n,
          statut: 'TERMINEE', // Déjà finie !
        }),
      });

      await expect(
        service.declarerEchec(1n, { motif: 'TENTATIVE' }, 100n),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

