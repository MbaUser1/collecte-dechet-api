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
import { DemandesCollecteService } from './demandes-collecte.service.js';
import { CreerDemandeCollecteDto } from './dto/creer-demande-collecte.dto.js';
import { FiltreDemandesCollecteDto } from './dto/filtre-demandes-collecte.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UtilisateurActuel } from '../auth/decorators/utilisateur-actuel.decorator.js';

@Controller('demandes-collecte')
@UseGuards(JwtAuthGuard)
export class DemandesCollecteController {
  constructor(
    private readonly demandesCollecteService: DemandesCollecteService,
  ) {}

  @Post()
  async creer(
    @Body() dto: CreerDemandeCollecteDto,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.demandesCollecteService.creerDemande(dto, {
      id: BigInt(utilisateur.id),
      role: utilisateur.role,
    });
    return {
      success: true,
      message: resultat.couvert_par_abonnement
        ? 'Demande de collecte créée et prise en charge par votre abonnement.'
        : 'Demande de collecte enregistrée. En attente de règlement.',
      data: resultat.demande,
    };
  }

  @Get('me')
  async listerMesDemandes(
    @Query() filtre: FiltreDemandesCollecteDto,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.demandesCollecteService.listerMesDemandes(
      {
        id: BigInt(utilisateur.id),
        role: utilisateur.role,
      },
      filtre,
    );
    return {
      success: true,
      message: 'Liste de vos demandes de collecte récupérée avec succès.',
      data: resultat,
    };
  }

  @Get(':id')
  async obtenir(
    @Param('id', ParseIntPipe) id: number,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const demande = await this.demandesCollecteService.obtenirDemandeParId(
      BigInt(id),
      {
        id: BigInt(utilisateur.id),
        role: utilisateur.role,
      },
    );
    return {
      success: true,
      message: 'Détail de la demande de collecte récupéré avec succès.',
      data: demande,
    };
  }

  @Post(':id/annuler')
  @HttpCode(HttpStatus.OK)
  async annuler(
    @Param('id', ParseIntPipe) id: number,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.demandesCollecteService.annulerDemande(
      BigInt(id),
      {
        id: BigInt(utilisateur.id),
        role: utilisateur.role,
      },
    );
    return {
      success: true,
      message: resultat.message,
      data: resultat.demande,
    };
  }
}

