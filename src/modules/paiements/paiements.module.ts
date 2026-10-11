import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PaiementsController } from './paiements.controller.js';
import { PaiementsService } from './services/paiements.service.js';
import { IdempotenceService } from './services/idempotence.service.js';
import { FournisseurDemoService } from './fournisseurs/fournisseur-demo.service.js';
import { PortefeuilleModule } from '../portefeuille/portefeuille.module.js';
import { AbonnementsModule } from '../abonnements/abonnements.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    forwardRef(() => PortefeuilleModule),
    AbonnementsModule,
  ],
  controllers: [PaiementsController],
  providers: [
    PaiementsService,
    IdempotenceService,
    FournisseurDemoService,
  ],
  exports: [
    PaiementsService,
    IdempotenceService,
    FournisseurDemoService,
  ],
})
export class PaiementsModule {}

