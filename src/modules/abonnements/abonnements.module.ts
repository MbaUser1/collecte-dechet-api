import { Module } from '@nestjs/common';
import { AbonnementsService } from './services/abonnements.service.js';
import { QuotaService } from './services/quota.service.js';
import { AbonnementsController } from './abonnements.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [AbonnementsController],
  providers: [AbonnementsService, QuotaService],
  exports: [AbonnementsService, QuotaService],
})
export class AbonnementsModule {}

