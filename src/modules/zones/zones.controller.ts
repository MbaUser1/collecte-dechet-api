import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ZonesService } from './services/zones.service.js';
import { CreerZoneDto } from './dto/creer-zone.dto.js';
import { ModifierZoneDto } from './dto/modifier-zone.dto.js';
import { FiltreZonesDto } from './dto/filtre-zones.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@Controller('zones')
export class ZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  @Get()
  async lister(@Query() filtre: FiltreZonesDto) {
    const resultat = await this.zonesService.listerZones(filtre);
    return {
      success: true,
      message: 'Liste des zones géographiques récupérée avec succès.',
      data: resultat,
    };
  }

  @Get(':id')
  async obtenir(@Param('id', ParseIntPipe) id: number) {
    const zone = await this.zonesService.obtenirZoneParId(BigInt(id));
    return {
      success: true,
      message: 'Détail de la zone géographique récupéré avec succès.',
      data: zone,
    };
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATEUR')
  async creer(@Body() dto: CreerZoneDto) {
    const zone = await this.zonesService.creerZone(dto);
    return {
      success: true,
      message: 'Zone géographique créée avec succès.',
      data: zone,
    };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATEUR')
  async modifier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModifierZoneDto,
  ) {
    const zone = await this.zonesService.modifierZone(BigInt(id), dto);
    return {
      success: true,
      message: 'Zone géographique modifiée avec succès.',
      data: zone,
    };
  }

  @Patch(':id/desactiver')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATEUR')
  async desactiver(@Param('id', ParseIntPipe) id: number) {
    const zone = await this.zonesService.desactiverZone(BigInt(id));
    return {
      success: true,
      message: 'Zone géographique désactivée avec succès.',
      data: zone,
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATEUR')
  async supprimer(@Param('id', ParseIntPipe) id: number) {
    const zone = await this.zonesService.desactiverZone(BigInt(id));
    return {
      success: true,
      message: 'Zone géographique désactivée avec succès.',
      data: zone,
    };
  }
}

