import { Module, forwardRef } from '@nestjs/common';
import { AjustementsService } from './ajustements.service.js';
import { PortefeuilleModule } from '../portefeuille/portefeuille.module.js';

@Module({
  imports: [forwardRef(() => PortefeuilleModule)],
  providers: [AjustementsService],
  exports: [AjustementsService],
})
export class AjustementsModule {}

