import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditService, assainirDetailsAudit } from './audit.service.js';

describe('AuditService', () => {
  let service: AuditService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      orm: {
        public: {
          JournalAudit: {
            create: vi.fn().mockResolvedValue({ id: 1n }),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            offset: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue([
              {
                id: 1n,
                action: 'MODIFICATION_COMPTE',
                entite: 'Utilisateur',
                entite_id: 10n,
                details: JSON.stringify({ champ: 'valeur' }),
                date_creation: new Date(),
              },
            ]),
            count: vi.fn().mockResolvedValue(1),
          },
        },
      },
    };

    service = new AuditService(mockPrisma);
  });

  describe('assainirDetailsAudit', () => {
    it('doit masquer récursivement tous les mots de passe, jetons et secrets', () => {
      const donneesBrutes = {
        utilisateur_id: 42,
        mot_de_passe: 'SuperSecret123!',
        password_confirmation: 'SuperSecret123!',
        token: 'eyJh...',
        refresh_token: 'refresh_xyz',
        cle_secrete: 'xyz123',
        signature_webhook: 'hmac_sha256',
        jeton_refresh_hash: 'hash123',
        metadata: {
          nom: 'Jean',
          secret_code: '4567',
        },
      };

      const resultat = assainirDetailsAudit(donneesBrutes);

      expect(resultat.utilisateur_id).toBe(42);
      expect(resultat.mot_de_passe).toBe('[MASQUE]');
      expect(resultat.password_confirmation).toBe('[MASQUE]');
      expect(resultat.token).toBe('[MASQUE]');
      expect(resultat.refresh_token).toBe('[MASQUE]');
      expect(resultat.cle_secrete).toBe('[MASQUE]');
      expect(resultat.signature_webhook).toBe('[MASQUE]');
      expect(resultat.jeton_refresh_hash).toBe('[MASQUE]');
      expect(resultat.metadata.nom).toBe('Jean');
      expect(resultat.metadata.secret_code).toBe('[MASQUE]');
    });
  });

  describe('enregistrerAction', () => {
    it('doit persister l action avec les détails assainis', async () => {
      await service.enregistrerAction(
        1n,
        'SUSPENSION_COMPTE',
        'Utilisateur',
        10n,
        { motif: 'Fraude', mot_de_passe: '123456' },
        '127.0.0.1',
        'Mozilla/5.0',
      );

      expect(mockPrisma.orm.public.JournalAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          utilisateur_id: 1n,
          action: 'SUSPENSION_COMPTE',
          entite: 'Utilisateur',
          entite_id: 10n,
          adresse_ip: '127.0.0.1',
          agent_utilisateur: 'Mozilla/5.0',
        }),
      );

      const detailsEnregistres = JSON.parse(
        mockPrisma.orm.public.JournalAudit.create.mock.calls[0][0].details,
      );
      expect(detailsEnregistres.motif).toBe('Fraude');
      expect(detailsEnregistres.mot_de_passe).toBe('[MASQUE]');
    });

    it('ne doit pas faire échouer l appelant si l écriture en base échoue', async () => {
      mockPrisma.orm.public.JournalAudit.create.mockRejectedValue(new Error('Erreur DB'));

      await expect(
        service.enregistrerAction(1n, 'ACTION', 'Entite', 2n),
      ).resolves.toBeUndefined();
    });
  });

  describe('listerJournaux', () => {
    it('doit retourner une liste paginée avec les détails désérialisés', async () => {
      const res = await service.listerJournaux({ page: 1, limite: 10 });

      expect(res.elements).toHaveLength(1);
      expect(res.elements[0].id).toBe('1');
      expect(res.elements[0].details).toEqual({ champ: 'valeur' });
      expect(res.pagination.total).toBe(1);
      expect(res.pagination.pages_totales).toBe(1);
    });
  });
});

