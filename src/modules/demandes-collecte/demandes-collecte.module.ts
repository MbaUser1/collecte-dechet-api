import { Module } from '@nestjs/common';
import { DemandesCollecteService } from './demandes-collecte.service.js';
import { DemandesCollecteController } from './demandes-collecte.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { AbonnementsModule } from '../abonnements/abonnements.module.js';
import { TarifsModule } from '../tarifs/tarifs.module.js';
import { ZonesModule } from '../zones/zones.module.js';
import { PointsCollecteModule } from '../points-collecte/points-collecte.module.js';
import { AjustementsModule } from '../ajustements/ajustements.module.js';

@Module({
  imports: [
    AuthModule,
    AbonnementsModule,
    TarifsModule,
    ZonesModule,
    PointsCollecteModule,
    AjustementsModule,
  ],
  controllers: [DemandesCollecteController],
  providers: [DemandesCollecteService],
  exports: [DemandesCollecteService],
})
export class DemandesCollecteModule {}

