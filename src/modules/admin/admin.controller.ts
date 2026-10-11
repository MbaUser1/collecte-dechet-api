import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminService } from './admin.service.js';
import { AuditService } from '../audit/audit.service.js';
import { FiltreAdminUtilisateursDto } from './dto/filtre-admin-utilisateurs.dto.js';
import { ChangerStatutUtilisateurDto } from './dto/changer-statut-utilisateur.dto.js';
import { FiltreAdminDemandesDto } from './dto/filtre-admin-demandes.dto.js';
import { AffecterCollecteurDto } from './dto/affecter-collecteur.dto.js';
import { FiltreAuditDto } from '../audit/dto/filtre-audit.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UtilisateurActuel } from '../auth/decorators/utilisateur-actuel.decorator.js';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMINISTRATEUR')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly auditService: AuditService,
  ) {}

  @Get('dashboard')
  async obtenirDashboard(): Promise<any> {
    const data = await this.adminService.obtenirDashboard();
    return {
      success: true,
      message: 'Tableau de bord administratif généré avec succès.',
      data,
    };
  }

  @Get('utilisateurs')
  async listerUtilisateurs(@Query() filtre: FiltreAdminUtilisateursDto) {
    const resultat = await this.adminService.listerUtilisateurs(filtre);
    return {
      success: true,
      message: 'Liste des utilisateurs récupérée avec succès.',
      data: resultat.elements,
      pagination: resultat.pagination,
    };
  }

  @Get('utilisateurs/:id')
  async obtenirUtilisateur(@Param('id', ParseIntPipe) id: number) {
    const data = await this.adminService.obtenirUtilisateur(BigInt(id));
    return {
      success: true,
      message: 'Détails de l’utilisateur récupérés avec succès.',
      data,
    };
  }

  @Patch('utilisateurs/:id/statut')
  async changerStatutUtilisateur(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangerStatutUtilisateurDto,
    @UtilisateurActuel('id') adminId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const data = await this.adminService.changerStatutUtilisateur(
      BigInt(id),
      dto,
      BigInt(adminId),
      ip,
      userAgent,
    );
    return {
      success: true,
      message: `Statut utilisateur mis à jour vers ${dto.statut}.`,
      data,
    };
  }

  @Get('demandes')
  async listerDemandes(@Query() filtre: FiltreAdminDemandesDto) {
    const resultat = await this.adminService.listerDemandes(filtre);
    return {
      success: true,
      message: 'Liste des demandes de collecte récupérée avec succès.',
      data: resultat.elements,
      pagination: resultat.pagination,
    };
  }

  @Get('demandes/:id')
  async obtenirDemande(@Param('id', ParseIntPipe) id: number) {
    const data = await this.adminService.obtenirDemande(BigInt(id));
    return {
      success: true,
      message: 'Détails de la demande de collecte récupérés avec succès.',
      data,
    };
  }

  @Post('demandes/:id/affecter-collecteur')
  @HttpCode(HttpStatus.OK)
  async affecterCollecteur(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AffecterCollecteurDto,
    @UtilisateurActuel('id') adminId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const data = await this.adminService.affecterCollecteur(
      BigInt(id),
      dto,
      BigInt(adminId),
      ip,
      userAgent,
    );
    return {
      success: true,
      message: data.message,
      data,
    };
  }

  @Get('audit')
  async listerAudit(@Query() filtre: FiltreAuditDto) {
    const resultat = await this.auditService.listerJournaux(filtre);
    return {
      success: true,
      message: 'Journal d’audit récupéré avec succès.',
      data: resultat.elements,
      pagination: resultat.pagination,
    };
  }
}
