import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PortefeuilleService } from './portefeuille.service.js';
import { PortefeuilleController } from './portefeuille.controller.js';
import { PaiementsModule } from '../paiements/paiements.module.js';
import { AjustementsModule } from '../ajustements/ajustements.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    forwardRef(() => PaiementsModule),
    forwardRef(() => AjustementsModule),
  ],
  controllers: [PortefeuilleController],
  providers: [PortefeuilleService],
  exports: [PortefeuilleService],
})
export class PortefeuilleModule {}

