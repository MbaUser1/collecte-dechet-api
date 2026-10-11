import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UtilisateurActuel } from '../auth/decorators/utilisateur-actuel.decorator.js';
import { RecompensesService } from './recompenses.service.js';
import { FiltreRecompensesDto } from './dto/recompenses.dto.js';

@Controller('recompenses')
@UseGuards(JwtAuthGuard)
export class RecompensesController {
  constructor(private readonly recompensesService: RecompensesService) {}

  @Get()
  async listerCatalogue(@Query() filtre: FiltreRecompensesDto) {
    const resultat = await this.recompensesService.listerRecompensesDisponibles(filtre);

    return {
      success: true,
      message: 'Catalogue des récompenses disponibles récupéré avec succès.',
      data: resultat.elements,
      pagination: resultat.pagination,
    };
  }

  @Get('mes-reclamations')
  async listerMesReclamations(
    @Query() filtre: FiltreRecompensesDto,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.recompensesService.listerMesReclamations(
      BigInt(utilisateur.id),
      filtre,
    );

    return {
      success: true,
      message: 'Vos réclamations de récompenses récupérées avec succès.',
      data: resultat.elements,
      pagination: resultat.pagination,
    };
  }

  @Get(':id')
  async obtenirRecompense(@Param('id', ParseIntPipe) id: number) {
    const recompense = await this.recompensesService.obtenirRecompenseParId(BigInt(id));

    return {
      success: true,
      message: 'Détail de la récompense récupéré avec succès.',
      data: recompense,
    };
  }

  @Post(':id/reclamer')
  @HttpCode(HttpStatus.OK)
  async reclamer(
    @Param('id', ParseIntPipe) id: number,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.recompensesService.reclamerRecompense(
      BigInt(id),
      BigInt(utilisateur.id),
    );

    return {
      success: true,
      message: resultat.message,
      data: resultat,
    };
  }
}

