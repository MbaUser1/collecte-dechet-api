import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './services/auth.service.js';
import { HachageService } from './services/hachage.service.js';
import { JetonService } from './services/jeton.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, HachageService, JetonService, JwtAuthGuard, RolesGuard],
  exports: [AuthService, HachageService, JetonService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}

