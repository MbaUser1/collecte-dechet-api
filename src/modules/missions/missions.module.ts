import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { TarifsModule } from '../tarifs/tarifs.module.js';
import { AbonnementsModule } from '../abonnements/abonnements.module.js';
import { AjustementsModule } from '../ajustements/ajustements.module.js';
import { MissionsController } from './missions.controller.js';
import { MissionsService } from './missions.service.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    TarifsModule,
    AbonnementsModule,
    AjustementsModule,
  ],
  controllers: [MissionsController],
  providers: [MissionsService],
  exports: [MissionsService],
})
export class MissionsModule {}

