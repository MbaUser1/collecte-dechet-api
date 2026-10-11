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
import { CatalogueService } from './catalogue.service.js';
import { CreerTypeDechetDto } from './dto/creer-type-dechet.dto.js';
import { ModifierTypeDechetDto } from './dto/modifier-type-dechet.dto.js';
import { FiltreTypesDechetsDto } from './dto/filtre-types-dechets.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@Controller('types-dechets')
export class TypesDechetsController {
  constructor(private readonly catalogueService: CatalogueService) {}

  @Get()
  async lister(@Query() filtre: FiltreTypesDechetsDto) {
    const resultat = await this.catalogueService.listerTypesDechets(filtre);
    return {
      success: true,
      message: 'Liste des types de déchets récupérée avec succès.',
      data: resultat,
    };
  }

  @Get(':id')
  async obtenir(@Param('id', ParseIntPipe) id: number) {
    const typeDechet = await this.catalogueService.obtenirTypeDechetParId(BigInt(id));
    return {
      success: true,
      message: 'Détail du type de déchet récupéré avec succès.',
      data: typeDechet,
    };
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATEUR')
  async creer(@Body() dto: CreerTypeDechetDto) {
    const typeDechet = await this.catalogueService.creerTypeDechet(dto);
    return {
      success: true,
      message: 'Type de déchet créé avec succès.',
      data: typeDechet,
    };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATEUR')
  async modifier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModifierTypeDechetDto,
  ) {
    const typeDechet = await this.catalogueService.modifierTypeDechet(BigInt(id), dto);
    return {
      success: true,
      message: 'Type de déchet modifié avec succès.',
      data: typeDechet,
    };
  }

  @Patch(':id/desactiver')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATEUR')
  async desactiver(@Param('id', ParseIntPipe) id: number) {
    const typeDechet = await this.catalogueService.desactiverTypeDechet(BigInt(id));
    return {
      success: true,
      message: 'Type de déchet désactivé avec succès.',
      data: typeDechet,
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATEUR')
  async supprimer(@Param('id', ParseIntPipe) id: number) {
    const typeDechet = await this.catalogueService.desactiverTypeDechet(BigInt(id));
    return {
      success: true,
      message: 'Type de déchet désactivé avec succès (conservation des données liées).',
      data: typeDechet,
    };
  }
}

