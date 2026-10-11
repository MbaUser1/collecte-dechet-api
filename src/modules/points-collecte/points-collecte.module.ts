import { Module } from '@nestjs/common';
import { PointsCollecteService } from './services/points-collecte.service.js';
import { EntrepriseService } from './services/entreprise.service.js';
import { PointsCollecteController } from './points-collecte.controller.js';
import { EntreprisesController } from './entreprises.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [PointsCollecteController, EntreprisesController],
  providers: [PointsCollecteService, EntrepriseService],
  exports: [PointsCollecteService, EntrepriseService],
})
export class PointsCollecteModule {}

