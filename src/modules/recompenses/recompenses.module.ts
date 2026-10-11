import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { RecompensesService } from './recompenses.service.js';
import { PointsController } from './points.controller.js';
import { RecompensesController } from './recompenses.controller.js';
import { AdminRecompensesController } from './admin-recompenses.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PointsController, RecompensesController, AdminRecompensesController],
  providers: [RecompensesService],
  exports: [RecompensesService],
})
export class RecompensesModule {}

