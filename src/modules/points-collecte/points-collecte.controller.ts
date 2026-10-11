import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { PointsCollecteService } from './services/points-collecte.service.js';
import { CreerPointCollecteDto } from './dto/creer-point-collecte.dto.js';
import { ModifierPointCollecteDto } from './dto/modifier-point-collecte.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UtilisateurActuel } from '../auth/decorators/utilisateur-actuel.decorator.js';

@Controller('points-collecte')
@UseGuards(JwtAuthGuard)
export class PointsCollecteController {
  constructor(private readonly pointsCollecteService: PointsCollecteService) {}

  @Get()
  async lister(@UtilisateurActuel() utilisateur: any) {
    const points = await this.pointsCollecteService.listerPoints({
      id: BigInt(utilisateur.id),
      role: utilisateur.role,
    });
    return {
      success: true,
      message: 'Points de collecte récupérés avec succès.',
      data: points,
    };
  }

  @Get(':id')
  async obtenir(
    @Param('id', ParseIntPipe) id: number,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const point = await this.pointsCollecteService.obtenirPointParId(BigInt(id), {
      id: BigInt(utilisateur.id),
      role: utilisateur.role,
    });
    return {
      success: true,
      message: 'Détail du point de collecte récupéré avec succès.',
      data: point,
    };
  }

  @Post()
  async creer(
    @Body() dto: CreerPointCollecteDto,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const point = await this.pointsCollecteService.creerPoint(dto, {
      id: BigInt(utilisateur.id),
      role: utilisateur.role,
    });
    return {
      success: true,
      message: 'Point de collecte créé avec succès.',
      data: point,
    };
  }

  @Patch(':id')
  async modifier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModifierPointCollecteDto,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const point = await this.pointsCollecteService.modifierPoint(BigInt(id), dto, {
      id: BigInt(utilisateur.id),
      role: utilisateur.role,
    });
    return {
      success: true,
      message: 'Point de collecte mis à jour avec succès.',
      data: point,
    };
  }

  @Patch(':id/desactiver')
  async desactiver(
    @Param('id', ParseIntPipe) id: number,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const point = await this.pointsCollecteService.desactiverPoint(BigInt(id), {
      id: BigInt(utilisateur.id),
      role: utilisateur.role,
    });
    return {
      success: true,
      message: 'Point de collecte désactivé avec succès.',
      data: point,
    };
  }

  @Delete(':id')
  async supprimer(
    @Param('id', ParseIntPipe) id: number,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.pointsCollecteService.supprimerPoint(BigInt(id), {
      id: BigInt(utilisateur.id),
      role: utilisateur.role,
    });
    return {
      success: true,
      message: resultat.message,
      data: resultat,
    };
  }
}

