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
import { CreerCategorieDto } from './dto/creer-categorie.dto.js';
import { ModifierCategorieDto } from './dto/modifier-categorie.dto.js';
import { FiltreCategoriesDto } from './dto/filtre-categories.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@Controller('categories-dechets')
export class CategoriesController {
  constructor(private readonly catalogueService: CatalogueService) {}

  @Get()
  async lister(@Query() filtre: FiltreCategoriesDto) {
    const resultat = await this.catalogueService.listerCategories(filtre);
    return {
      success: true,
      message: 'Liste des catégories de déchets récupérée avec succès.',
      data: resultat,
    };
  }

  @Get(':id')
  async obtenir(@Param('id', ParseIntPipe) id: number) {
    const categorie = await this.catalogueService.obtenirCategorieParId(BigInt(id));
    return {
      success: true,
      message: 'Détail de la catégorie récupéré avec succès.',
      data: categorie,
    };
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATEUR')
  async creer(@Body() dto: CreerCategorieDto) {
    const categorie = await this.catalogueService.creerCategorie(dto);
    return {
      success: true,
      message: 'Catégorie de déchet créée avec succès.',
      data: categorie,
    };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATEUR')
  async modifier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModifierCategorieDto,
  ) {
    const categorie = await this.catalogueService.modifierCategorie(BigInt(id), dto);
    return {
      success: true,
      message: 'Catégorie de déchet modifiée avec succès.',
      data: categorie,
    };
  }

  @Patch(':id/desactiver')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATEUR')
  async desactiver(@Param('id', ParseIntPipe) id: number) {
    const categorie = await this.catalogueService.desactiverCategorie(BigInt(id));
    return {
      success: true,
      message: 'Catégorie de déchet désactivée avec succès.',
      data: categorie,
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATEUR')
  async supprimer(@Param('id', ParseIntPipe) id: number) {
    const categorie = await this.catalogueService.desactiverCategorie(BigInt(id));
    return {
      success: true,
      message: 'Catégorie de déchet désactivée avec succès (conservation des données liées).',
      data: categorie,
    };
  }
}

