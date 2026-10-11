import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UtilisateurActuel } from '../auth/decorators/utilisateur-actuel.decorator.js';
import { MissionsService } from './missions.service.js';
import { FiltreCollectesDisponiblesDto } from './dto/filtre-collectes-disponibles.dto.js';
import { FiltreMissionsCollecteurDto } from './dto/filtre-missions-collecteur.dto.js';
import { ScannerQrDto } from './dto/scanner-qr.dto.js';
import { EnregistrerCollecteDto } from './dto/enregistrer-collecte.dto.js';
import { DeclarerEchecMissionDto } from './dto/declarer-echec-mission.dto.js';

@Controller('collecteur')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('COLLECTEUR')
export class MissionsController {
  constructor(private readonly missionsService: MissionsService) {}

  @Get('collectes-disponibles')
  async listerCollectesDisponibles(
    @Query() filtre: FiltreCollectesDisponiblesDto,
  ) {
    const resultat = await this.missionsService.listerCollectesDisponibles(filtre);

    return {
      success: true,
      message: 'Collectes disponibles récupérées avec succès.',
      data: resultat.elements,
      pagination: resultat.pagination,
    };
  }

  @Get('missions/me')
  async listerMesMissions(
    @Query() filtre: FiltreMissionsCollecteurDto,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.missionsService.listerMesMissions(
      BigInt(utilisateur.id),
      filtre,
    );

    return {
      success: true,
      message: 'Missions du collecteur récupérées avec succès.',
      data: resultat.elements,
      pagination: resultat.pagination,
    };
  }

  @Get('missions/:id')
  async obtenirMission(
    @Param('id', ParseIntPipe) id: number,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const mission = await this.missionsService.obtenirMissionParId(
      BigInt(id),
      BigInt(utilisateur.id),
    );

    return {
      success: true,
      message: 'Détail de la mission récupéré avec succès.',
      data: mission,
    };
  }

  @Post('collectes/:id/accepter')
  @HttpCode(HttpStatus.OK)
  async accepterCollecte(
    @Param('id', ParseIntPipe) id: number,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.missionsService.accepterCollecte(
      BigInt(id),
      {
        id: BigInt(utilisateur.id),
        role: utilisateur.role,
      },
    );

    return {
      success: true,
      message: resultat.message,
      data: resultat,
    };
  }

  @Post('missions/:id/scanner-qr')
  @HttpCode(HttpStatus.OK)
  async scannerQr(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ScannerQrDto,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.missionsService.scannerQrEtDemarrer(
      BigInt(id),
      dto,
      BigInt(utilisateur.id),
    );

    return {
      success: true,
      message: resultat.message,
      data: resultat,
    };
  }

  @Post('missions/:id/collecte')
  @HttpCode(HttpStatus.OK)
  async enregistrerCollecte(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EnregistrerCollecteDto,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.missionsService.enregistrerCollecte(
      BigInt(id),
      dto,
      BigInt(utilisateur.id),
    );

    return {
      success: true,
      message: resultat.message,
      data: resultat,
    };
  }

  @Post('missions/:id/echec')
  @HttpCode(HttpStatus.OK)
  async declarerEchec(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DeclarerEchecMissionDto,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.missionsService.declarerEchec(
      BigInt(id),
      dto,
      BigInt(utilisateur.id),
    );

    return {
      success: true,
      message: resultat.message,
      data: resultat,
    };
  }
}

