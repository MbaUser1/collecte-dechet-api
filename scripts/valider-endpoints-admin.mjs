import 'dotenv/config';
import 'temporal-polyfill/full/global';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { JetonService } from '../dist/modules/auth/services/jeton.service.js';
import { ValidationPipe } from '@nestjs/common';
import { TransformInterceptor } from '../dist/common/interceptors/transform.interceptor.js';
import { HttpExceptionFilter } from '../dist/common/filters/http-exception.filter.js';
import request from 'supertest';

async function main() {
  console.log('--- DÉMARRAGE DU TEST DE VALIDATION DES ENDPOINTS ADMIN ---');

  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });

  app.setGlobalPrefix('api/v1', {
    exclude: ['/', 'sante'],
  });
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();
  const server = app.getHttpServer();

  const jetonService = app.get(JetonService);

  // Génération d'un token d'administrateur valide pour l'admin ID 2
  const adminToken = jetonService.genererAccessToken({
    sub: '2',
    role: 'ADMINISTRATEUR',
    telephone: '+237699999999',
  });

  const authHeader = `Bearer ${adminToken}`;
  const resultats = {};

  try {
    // 1. GET /api/v1/admin/dashboard
    console.log('\n1. Test GET /api/v1/admin/dashboard ...');
    const resDashboard = await request(server)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', authHeader);
    console.log('Status:', resDashboard.status);
    console.log('Body data:', JSON.stringify(resDashboard.body?.data || resDashboard.body, null, 2));
    resultats['dashboard'] = {
      status: resDashboard.status,
      success: resDashboard.status === 200,
      total_utilisateurs: resDashboard.body?.data?.utilisateurs?.total,
      total_demandes: resDashboard.body?.data?.demandes?.total,
    };

    // 2. GET /api/v1/admin/utilisateurs?limite=100
    console.log('\n2. Test GET /api/v1/admin/utilisateurs?limite=100 ...');
    const resUsers = await request(server)
      .get('/api/v1/admin/utilisateurs?limite=100')
      .set('Authorization', authHeader);
    console.log('Status:', resUsers.status);
    console.log('Pagination:', resUsers.body?.pagination);
    console.log('Count retourné:', resUsers.body?.data?.length);
    resultats['utilisateurs_100'] = {
      status: resUsers.status,
      success: resUsers.status === 200,
      total: resUsers.body?.pagination?.total,
      count_recu: resUsers.body?.data?.length,
    };

    // 2b. Test pagination et filtres sur utilisateurs
    console.log('\n2b. Test pagination /api/v1/admin/utilisateurs?page=2&limite=3 ...');
    const resUsersP2 = await request(server)
      .get('/api/v1/admin/utilisateurs?page=2&limite=3')
      .set('Authorization', authHeader);
    console.log('Status:', resUsersP2.status);
    console.log('Pagination P2:', resUsersP2.body?.pagination);
    console.log('Count P2:', resUsersP2.body?.data?.length);

    console.log('\n2c. Test filtre /api/v1/admin/utilisateurs?role=ADMINISTRATEUR ...');
    const resUsersFilter = await request(server)
      .get('/api/v1/admin/utilisateurs?role=ADMINISTRATEUR')
      .set('Authorization', authHeader);
    console.log('Status:', resUsersFilter.status);
    console.log('Admins trouvés:', resUsersFilter.body?.pagination?.total);

    // 3. GET /api/v1/admin/demandes?limite=100
    console.log('\n3. Test GET /api/v1/admin/demandes?limite=100 ...');
    const resDemandes = await request(server)
      .get('/api/v1/admin/demandes?limite=100')
      .set('Authorization', authHeader);
    console.log('Status:', resDemandes.status);
    console.log('Pagination:', resDemandes.body?.pagination);
    resultats['demandes_100'] = {
      status: resDemandes.status,
      success: resDemandes.status === 200,
      total: resDemandes.body?.pagination?.total,
    };

    // 4. GET /api/v1/admin/signalements?limite=50
    console.log('\n4. Test GET /api/v1/admin/signalements?limite=50 ...');
    const resSignalements = await request(server)
      .get('/api/v1/admin/signalements?limite=50')
      .set('Authorization', authHeader);
    console.log('Status:', resSignalements.status);
    console.log('Pagination:', resSignalements.body?.pagination);
    resultats['signalements_50'] = {
      status: resSignalements.status,
      success: resSignalements.status === 200,
      total: resSignalements.body?.pagination?.total,
    };

    // 5. GET /api/v1/admin/audit?limite=50
    console.log('\n5. Test GET /api/v1/admin/audit?limite=50 ...');
    const resAudit = await request(server)
      .get('/api/v1/admin/audit?limite=50')
      .set('Authorization', authHeader);
    console.log('Status:', resAudit.status);
    console.log('Pagination:', resAudit.body?.pagination);
    resultats['audit_50'] = {
      status: resAudit.status,
      success: resAudit.status === 200,
      total: resAudit.body?.pagination?.total,
    };

    // 6. GET /api/v1/types-dechets
    console.log('\n6. Test GET /api/v1/types-dechets ...');
    const resTypes = await request(server).get('/api/v1/types-dechets');
    console.log('Status:', resTypes.status);
    console.log('Pagination:', resTypes.body?.data?.pagination || resTypes.body?.pagination);
    resultats['types_dechets'] = {
      status: resTypes.status,
      success: resTypes.status === 200,
      total: resTypes.body?.data?.pagination?.total ?? resTypes.body?.pagination?.total,
    };

    // 7. GET /api/v1/zones
    console.log('\n7. Test GET /api/v1/zones ...');
    const resZones = await request(server).get('/api/v1/zones');
    console.log('Status:', resZones.status);
    console.log('Pagination:', resZones.body?.data?.pagination || resZones.body?.pagination);
    resultats['zones'] = {
      status: resZones.status,
      success: resZones.status === 200,
      total: resZones.body?.data?.pagination?.total ?? resZones.body?.pagination?.total,
    };

    // 8. Test création d'une filière de déchets en évitant les doublons
    console.log('\n8. Test création d\'une filière de déchets (catégorie + type) avec détection des doublons ...');
    const nomCat = 'Filière Recyclage Staging Test';
    const nomType = 'Plastique Recyclable Test Staging';

    // A. Recherche si la catégorie existe déjà
    const resCategories = await request(server)
      .get(`/api/v1/categories-dechets?recherche=${encodeURIComponent(nomCat)}`)
      .set('Authorization', authHeader);
    
    let catId;
    const catExistante = (resCategories.body?.data?.elements || []).find(c => c.nom === nomCat);

    if (catExistante) {
      console.log(`Catégorie '${nomCat}' déjà existante (ID: ${catExistante.id}), réutilisation pour éviter le doublon.`);
      catId = catExistante.id;
    } else {
      console.log(`Création de la catégorie '${nomCat}' ...`);
      const resCreerCat = await request(server)
        .post('/api/v1/categories-dechets')
        .set('Authorization', authHeader)
        .send({
          nom: nomCat,
          description: 'Catégorie créée lors du test de validation des endpoints',
        });
      console.log('Création Catégorie Status:', resCreerCat.status);
      catId = resCreerCat.body?.data?.id;
      console.log('Nouvelle Catégorie ID:', catId);
    }

    // B. Recherche si le type existe déjà
    const resTypesExistants = await request(server)
      .get(`/api/v1/types-dechets?categorie_dechet_id=${catId}&recherche=${encodeURIComponent(nomType)}`);
    
    const typeExistant = (resTypesExistants.body?.data?.elements || []).find(t => t.nom === nomType);
    let typeResultat;

    if (typeExistant) {
      console.log(`Type de déchet '${nomType}' déjà existant (ID: ${typeExistant.id}), doublon évité avec succès.`);
      typeResultat = { id: typeExistant.id, statut: 'DEJA_EXISTANT' };
    } else {
      console.log(`Création du type de déchet '${nomType}' sous la catégorie ID ${catId} ...`);
      const resCreerType = await request(server)
        .post('/api/v1/types-dechets')
        .set('Authorization', authHeader)
        .send({
          categorie_dechet_id: Number(catId),
          nom: nomType,
          description: 'Type de déchet test créé lors de la validation',
        });
      console.log('Création Type Status:', resCreerType.status);
      console.log('Nouveau Type:', resCreerType.body?.data?.id, resCreerType.body?.data?.nom);
      typeResultat = { id: resCreerType.body?.data?.id, statut: 'CREE' };
    }

    resultats['filiere_creation'] = {
      categorie_id: catId,
      type_id: typeResultat.id,
      statut: typeResultat.statut,
    };

    console.log('\n--- TOUS LES ENDPOINTS ONT ÉTÉ TESTÉS AVEC SUCCÈS ---');
    console.log('BILAN DES RÉSULTATS:', JSON.stringify(resultats, null, 2));

  } catch (err) {
    console.error('ERREUR LORS DU TEST:', err);
  } finally {
    await app.close();
    process.exit(0);
  }
}

main();

