import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { FacturationService } from './facturation.service.js';

describe('FacturationService', () => {
  let service: FacturationService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      orm: {
        public: {
          Entreprise: {
            where: vi.fn(),
          },
          Devis: {
            where: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
          },
          Facture: {
            where: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
          },
          Paiement: {
            where: vi.fn(),
          },
        },
      },
      transaction: vi.fn(async (cb) => cb(mockPrisma)),
    };

    service = new FacturationService(mockPrisma);
  });

  describe('accepterDevis', () => {
    it('devrait valider le devis et générer automatiquement la facture en statut EMISE', async () => {
      mockPrisma.orm.public.Entreprise.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 50n, utilisateur_id: 20n }),
      });

      mockPrisma.orm.public.Devis.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          numero: 'DEV-001',
          entreprise_id: 50n,
          statut: 'EN_ATTENTE_VALIDATION',
          montant_ht: '100000',
          montant_tva: '19250',
          montant_ttc: '119250',
          date_validite: new Date(Date.now() + 86400000), // Demain
        }),
        update: vi.fn().mockResolvedValue({
          id: 1n,
          statut: 'VALIDE',
        }),
      });

      mockPrisma.orm.public.Facture.create.mockResolvedValue({
        id: 10n,
        numero: 'FACT-001',
        entreprise_id: 50n,
        devis_id: 1n,
        montant_ttc: '119250',
        statut: 'EMISE',
      });

      const res = await service.accepterDevis(1n, 20n);

      expect(res.succes).toBe(true);
      expect(res.devis.statut).toBe('VALIDE');
      expect(res.facture.statut).toBe('EMISE');
      expect(mockPrisma.orm.public.Facture.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entreprise_id: 50n,
          devis_id: 1n,
          montant_ttc: '119250',
          statut: 'EMISE',
        }),
      );
    });

    it('devrait refuser si le devis n’appartient pas à l’entreprise', async () => {
      mockPrisma.orm.public.Entreprise.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 50n, utilisateur_id: 20n }),
      });

      mockPrisma.orm.public.Devis.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          entreprise_id: 99n, // Autre entreprise
        }),
      });

      await expect(service.accepterDevis(1n, 20n)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('listerMesFactures', () => {
    it('devrait calculer dynamiquement le montant payé et le restant dû', async () => {
      mockPrisma.orm.public.Entreprise.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 50n }),
      });

      const mockQueryFacture = {
        where: vi.fn().mockReturnThis(),
        count: vi.fn().mockResolvedValue(1),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue([
          {
            id: 10n,
            numero: 'FACT-001',
            montant_ttc: '100000',
            statut: 'PARTIELLEMENT_PAYEE',
          },
        ]),
      };

      mockPrisma.orm.public.Facture.where.mockReturnValue(mockQueryFacture);

      // Paiements existants: 40000 FCFA
      mockPrisma.orm.public.Paiement.where.mockReturnValue({
        where: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue([
            { montant: '25000', statut: 'PAYE' },
            { montant: '15000', statut: 'PAYE' },
          ]),
        }),
      });

      const res = await service.listerMesFactures(20n, { page: 1, limite: 10, offset: 0 });

      expect(res.elements.length).toBe(1);
      expect(res.elements[0].montant_paye).toBe(40000);
      expect(res.elements[0].restant_du).toBe(60000);
    });
  });
});

