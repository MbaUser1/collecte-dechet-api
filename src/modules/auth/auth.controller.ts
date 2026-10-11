import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './services/auth.service.js';
import { InscriptionDto } from './dto/inscription.dto.js';
import { ConnexionDto } from './dto/connexion.dto.js';
import { RafraichirDto } from './dto/rafraichir.dto.js';
import { ModifierProfilDto } from './dto/modifier-profil.dto.js';
import { ChangerMotDePasseDto } from './dto/changer-mot-de-passe.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { UtilisateurActuel } from './decorators/utilisateur-actuel.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('inscription')
  async inscrire(@Body() dto: InscriptionDto, @Req() req: Request) {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const resultat = await this.authService.inscrire(dto, ip, userAgent);
    return {
      success: true,
      message: 'Compte créé avec succès.',
      data: resultat,
    };
  }

  @Post('connexion')
  @HttpCode(HttpStatus.OK)
  async connecter(@Body() dto: ConnexionDto, @Req() req: Request) {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const resultat = await this.authService.connecter(dto, ip, userAgent);
    return {
      success: true,
      message: 'Connexion réussie.',
      data: resultat,
    };
  }

  @Post('rafraichir')
  @HttpCode(HttpStatus.OK)
  async rafraichir(@Body() dto: RafraichirDto, @Req() req: Request) {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const resultat = await this.authService.rafraichir(dto, ip, userAgent);
    return {
      success: true,
      message: 'Jeton renouvelé avec succès.',
      data: resultat,
    };
  }

  @Post('deconnexion')
  @HttpCode(HttpStatus.OK)
  async deconnecter(@Body('refresh_token') refreshToken?: string) {
    const resultat = await this.authService.deconnecter(refreshToken);
    return {
      success: true,
      message: resultat.message,
      data: {},
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async obtenirProfil(@UtilisateurActuel() utilisateur: any) {
    const profil = await this.authService.obtenirProfil(BigInt(utilisateur.id));
    return {
      success: true,
      message: 'Profil récupéré avec succès.',
      data: profil,
    };
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async modifierProfil(
    @UtilisateurActuel('id') utilisateurId: string,
    @Body() dto: ModifierProfilDto,
  ) {
    const profilMisAJour = await this.authService.modifierProfil(BigInt(utilisateurId), dto);
    return {
      success: true,
      message: 'Profil mis à jour avec succès.',
      data: profilMisAJour,
    };
  }

  @Post('changer-mot-de-passe')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changerMotDePasse(
    @UtilisateurActuel('id') utilisateurId: string,
    @Body() dto: ChangerMotDePasseDto,
  ) {
    const resultat = await this.authService.changerMotDePasse(BigInt(utilisateurId), dto);
    return {
      success: true,
      message: resultat.message,
      data: {},
    };
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  async listerSessions(@UtilisateurActuel('id') utilisateurId: string) {
    const sessions = await this.authService.listerSessions(BigInt(utilisateurId));
    return {
      success: true,
      message: 'Sessions récupérées avec succès.',
      data: sessions,
    };
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  async revoquerSession(
    @UtilisateurActuel('id') utilisateurId: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const resultat = await this.authService.revoquerSession(BigInt(utilisateurId), BigInt(id));
    return {
      success: true,
      message: resultat.message,
      data: {},
    };
  }

  @Delete('sessions')
  @UseGuards(JwtAuthGuard)
  async revoquerToutesLesSessions(@UtilisateurActuel('id') utilisateurId: string) {
    const resultat = await this.authService.revoquerToutesLesSessions(BigInt(utilisateurId));
    return {
      success: true,
      message: resultat.message,
      data: {},
    };
  }
}
