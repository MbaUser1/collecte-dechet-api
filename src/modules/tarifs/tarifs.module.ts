import { Module } from '@nestjs/common';
import { TarifsService } from './services/tarifs.service.js';
import { CalculTarifService } from './services/calcul-tarif.service.js';
import { TarifsController } from './tarifs.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [TarifsController],
  providers: [TarifsService, CalculTarifService],
  exports: [TarifsService, CalculTarifService],
})
export class TarifsModule {}

