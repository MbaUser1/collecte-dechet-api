import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validateEnv } from './config/env.validation.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { SanteModule } from './modules/sante/sante.module.js';
import { CatalogueModule } from './modules/catalogue/catalogue.module.js';
import { ZonesModule } from './modules/zones/zones.module.js';
import { TarifsModule } from './modules/tarifs/tarifs.module.js';
import { PlansAbonnementModule } from './modules/plans-abonnement/plans-abonnement.module.js';
import { PointsCollecteModule } from './modules/points-collecte/points-collecte.module.js';
import { AbonnementsModule } from './modules/abonnements/abonnements.module.js';
import { DemandesCollecteModule } from './modules/demandes-collecte/demandes-collecte.module.js';
import { PortefeuilleModule } from './modules/portefeuille/portefeuille.module.js';
import { AjustementsModule } from './modules/ajustements/ajustements.module.js';
import { PaiementsModule } from './modules/paiements/paiements.module.js';
import { MissionsModule } from './modules/missions/missions.module.js';
import { SignalementsModule } from './modules/signalements/signalements.module.js';
import { RecompensesModule } from './modules/recompenses/recompenses.module.js';
import { FacturationModule } from './modules/facturation/facturation.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    SanteModule,
    CatalogueModule,
    ZonesModule,
    TarifsModule,
    PlansAbonnementModule,
    PointsCollecteModule,
    AbonnementsModule,
    DemandesCollecteModule,
    PortefeuilleModule,
    AjustementsModule,
    PaiementsModule,
    MissionsModule,
    SignalementsModule,
    RecompensesModule,
    FacturationModule,
    AuditModule,
    NotificationsModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}