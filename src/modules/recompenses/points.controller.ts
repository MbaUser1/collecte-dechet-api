import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UtilisateurActuel } from '../auth/decorators/utilisateur-actuel.decorator.js';
import { RecompensesService } from './recompenses.service.js';
import { FiltreTransactionsPointsDto } from './dto/recompenses.dto.js';

@Controller('points')
@UseGuards(JwtAuthGuard)
export class PointsController {
  constructor(private readonly recompensesService: RecompensesService) {}

  @Get('me')
  async obtenirMesPoints(
    @Query() filtre: FiltreTransactionsPointsDto,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.recompensesService.obtenirSoldeEtHistoriquePoints(
      BigInt(utilisateur.id),
      filtre,
    );

    return {
      success: true,
      message: 'Solde et historique des points civiques récupérés avec succès.',
      data: resultat,
    };
  }
}

