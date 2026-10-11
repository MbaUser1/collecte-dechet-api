import { Module } from '@nestjs/common';
import { ZonesService } from './services/zones.service.js';
import { DistanceService } from './services/distance.service.js';
import { ZonesController } from './zones.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [ZonesController],
  providers: [ZonesService, DistanceService],
  exports: [ZonesService, DistanceService],
})
export class ZonesModule {}

