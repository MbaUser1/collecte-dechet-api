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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TarifsService } from './services/tarifs.service.js';
import { CreerTarifDto } from './dto/creer-tarif.dto.js';
import { ModifierTarifDto } from './dto/modifier-tarif.dto.js';
import { FiltreTarifsDto } from './dto/filtre-tarifs.dto.js';
import { EstimerTarifDto } from './dto/estimer-tarif.dto.js';
import { TarifApplicableQueryDto } from './dto/tarif-applicable-query.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@Controller('tarifs')
export class TarifsController {
  constructor(private readonly tarifsService: TarifsService) {}

  @Get('applicable')
  async obtenirTarifApplicable(@Query() query: TarifApplicableQueryDto) {
    const tarif = await this.tarifsService.obtenirTarifApplicable(query);
    return {
      success: true,
      message: 'Tarif applicable récupéré avec succès.',
      data: tarif,
    };
  }

  @Post('estimer')
  @HttpCode(HttpStatus.OK)
  async estimerTarif(@Body() dto: EstimerTarifDto) {
    const estimation = await this.tarifsService.estimerTarif(dto);
    return {
      success: true,
      message: 'Estimation tarifaire calculée avec succès.',
      data: estimation,
    };
  }

  @Get()
  async lister(@Query() filtre: FiltreTarifsDto) {
    const resultat = await this.tarifsService.listerTarifs(filtre);
    return {
      success: true,
      message: 'Liste des tarifs récupérée avec succès.',
      data: resultat,
    };
  }

  @Get(':id')
  async obtenir(@Param('id', ParseIntPipe) id: number) {
    const tarif = await this.tarifsService.obtenirTarifParId(BigInt(id));
    return {
      success: true,
      message: 'Détail du barème tarifaire récupéré avec succès.',
      data: tarif,
    };
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATEUR')
  async creer(@Body() dto: CreerTarifDto) {
    const tarif = await this.tarifsService.creerTarif(dto);
    return {
      success: true,
      message: 'Barème tarifaire créé avec succès.',
      data: tarif,
    };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATEUR')
  async modifier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModifierTarifDto,
  ) {
    const tarif = await this.tarifsService.modifierTarif(BigInt(id), dto);
    return {
      success: true,
      message: 'Barème tarifaire modifié avec succès.',
      data: tarif,
    };
  }

  @Patch(':id/desactiver')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATEUR')
  async desactiver(@Param('id', ParseIntPipe) id: number) {
    const tarif = await this.tarifsService.desactiverTarif(BigInt(id));
    return {
      success: true,
      message: 'Barème tarifaire désactivé avec succès.',
      data: tarif,
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATEUR')
  async supprimer(@Param('id', ParseIntPipe) id: number) {
    const tarif = await this.tarifsService.desactiverTarif(BigInt(id));
    return {
      success: true,
      message: 'Barème tarifaire désactivé avec succès.',
      data: tarif,
    };
  }
}

