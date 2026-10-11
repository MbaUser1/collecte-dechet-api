import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AbonnementsService } from './services/abonnements.service.js';
import { SouscrireAbonnementDto } from './dto/souscrire-abonnement.dto.js';
import { FiltreAbonnementsDto } from './dto/filtre-abonnements.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UtilisateurActuel } from '../auth/decorators/utilisateur-actuel.decorator.js';

@Controller('abonnements')
@UseGuards(JwtAuthGuard)
export class AbonnementsController {
  constructor(private readonly abonnementsService: AbonnementsService) {}

  @Post()
  async souscrire(
    @Body() dto: SouscrireAbonnementDto,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.abonnementsService.souscrire(dto, {
      id: BigInt(utilisateur.id),
      role: utilisateur.role,
    });
    return {
      success: true,
      message: resultat.message,
      data: resultat.abonnement,
    };
  }

  @Get('me')
  async obtenirMonAbonnement(@UtilisateurActuel() utilisateur: any) {
    const abonnement = await this.abonnementsService.obtenirAbonnementCourant(
      BigInt(utilisateur.id),
    );
    return {
      success: true,
      message: 'Abonnement courant récupéré avec succès.',
      data: abonnement,
    };
  }

  @Get('historique')
  async listerHistorique(
    @Query() filtre: FiltreAbonnementsDto,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.abonnementsService.listerHistorique(
      BigInt(utilisateur.id),
      filtre,
    );
    return {
      success: true,
      message: 'Historique des abonnements récupéré avec succès.',
      data: resultat,
    };
  }

  @Get(':id')
  async obtenir(
    @Param('id', ParseIntPipe) id: number,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const abonnement = await this.abonnementsService.obtenirAbonnementParId(
      BigInt(id),
      {
        id: BigInt(utilisateur.id),
        role: utilisateur.role,
      },
    );
    return {
      success: true,
      message: 'Détail de l’abonnement récupéré avec succès.',
      data: abonnement,
    };
  }

  @Post(':id/annuler')
  @HttpCode(HttpStatus.OK)
  async annuler(
    @Param('id', ParseIntPipe) id: number,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.abonnementsService.annulerAbonnement(
      BigInt(id),
      {
        id: BigInt(utilisateur.id),
        role: utilisateur.role,
      },
    );
    return {
      success: true,
      message: resultat.message,
      data: resultat.abonnement,
    };
  }
}

