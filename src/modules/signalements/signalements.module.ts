import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { SignalementsService } from './signalements.service.js';
import { SignalementsController } from './signalements.controller.js';
import { AdminSignalementsController } from './admin-signalements.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SignalementsController, AdminSignalementsController],
  providers: [SignalementsService],
  exports: [SignalementsService],
})
export class SignalementsModule {}

