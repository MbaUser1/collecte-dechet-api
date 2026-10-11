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
import { PlansAbonnementService } from './plans-abonnement.service.js';
import { CreerPlanAbonnementDto } from './dto/creer-plan-abonnement.dto.js';
import { ModifierPlanAbonnementDto } from './dto/modifier-plan-abonnement.dto.js';
import { FiltrePlansAbonnementDto } from './dto/filtre-plans-abonnement.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@Controller('plans-abonnement')
export class PlansAbonnementController {
  constructor(private readonly plansAbonnementService: PlansAbonnementService) {}

  @Get()
  async lister(@Query() filtre: FiltrePlansAbonnementDto) {
    const resultat = await this.plansAbonnementService.listerPlans(filtre);
    return {
      success: true,
      message: "Liste des plans d'abonnement récupérée avec succès.",
      data: resultat,
    };
  }

  @Get(':id')
  async obtenir(@Param('id', ParseIntPipe) id: number) {
    const plan = await this.plansAbonnementService.obtenirPlanParId(BigInt(id));
    return {
      success: true,
      message: "Détail du plan d'abonnement récupéré avec succès.",
      data: plan,
    };
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATEUR')
  async creer(@Body() dto: CreerPlanAbonnementDto) {
    const plan = await this.plansAbonnementService.creerPlan(dto);
    return {
      success: true,
      message: "Plan d'abonnement créé avec succès.",
      data: plan,
    };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATEUR')
  async modifier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModifierPlanAbonnementDto,
  ) {
    const plan = await this.plansAbonnementService.modifierPlan(BigInt(id), dto);
    return {
      success: true,
      message: "Plan d'abonnement modifié avec succès.",
      data: plan,
    };
  }

  @Patch(':id/desactiver')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATEUR')
  async desactiver(@Param('id', ParseIntPipe) id: number) {
    const plan = await this.plansAbonnementService.desactiverPlan(BigInt(id));
    return {
      success: true,
      message: "Plan d'abonnement désactivé avec succès.",
      data: plan,
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATEUR')
  async supprimer(@Param('id', ParseIntPipe) id: number) {
    const plan = await this.plansAbonnementService.desactiverPlan(BigInt(id));
    return {
      success: true,
      message: "Plan d'abonnement désactivé avec succès.",
      data: plan,
    };
  }
}

