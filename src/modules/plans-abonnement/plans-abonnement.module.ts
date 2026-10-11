import { Module } from '@nestjs/common';
import { PlansAbonnementService } from './plans-abonnement.service.js';
import { PlansAbonnementController } from './plans-abonnement.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [PlansAbonnementController],
  providers: [PlansAbonnementService],
  exports: [PlansAbonnementService],
})
export class PlansAbonnementModule {}

