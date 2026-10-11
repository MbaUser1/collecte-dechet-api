import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { FacturationService } from './facturation.service.js';
import { EntreprisesFacturationController } from './entreprises-facturation.controller.js';
import { AdminFacturationController } from './admin-facturation.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [EntreprisesFacturationController, AdminFacturationController],
  providers: [FacturationService],
  exports: [FacturationService],
})
export class FacturationModule {}

