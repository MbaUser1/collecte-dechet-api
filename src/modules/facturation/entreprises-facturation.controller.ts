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
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UtilisateurActuel } from '../auth/decorators/utilisateur-actuel.decorator.js';
import { FacturationService } from './facturation.service.js';
import {
  FiltreDevisDto,
  FiltreFacturesEntrepriseDto,
} from './dto/facturation.dto.js';

@Controller('entreprises')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ENTREPRISE', 'ADMINISTRATEUR')
export class EntreprisesFacturationController {
  constructor(private readonly facturationService: FacturationService) {}

  @Get('devis')
  async listerDevis(
    @Query() filtre: FiltreDevisDto,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.facturationService.listerMesDevis(
      BigInt(utilisateur.id),
      filtre,
    );

    return {
      success: true,
      message: 'Liste de vos devis récupérée avec succès.',
      data: resultat.elements,
      pagination: resultat.pagination,
    };
  }

  @Get('devis/:id')
  async obtenirDevis(
    @Param('id', ParseIntPipe) id: number,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const devis = await this.facturationService.obtenirDevisParId(
      BigInt(id),
      BigInt(utilisateur.id),
      utilisateur.role,
    );

    return {
      success: true,
      message: 'Détail du devis récupéré avec succès.',
      data: devis,
    };
  }

  @Post('devis/:id/accepter')
  @HttpCode(HttpStatus.OK)
  async accepterDevis(
    @Param('id', ParseIntPipe) id: number,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.facturationService.accepterDevis(
      BigInt(id),
      BigInt(utilisateur.id),
    );

    return {
      success: true,
      message: resultat.message,
      data: {
        devis: resultat.devis,
        facture: resultat.facture,
      },
    };
  }

  @Post('devis/:id/refuser')
  @HttpCode(HttpStatus.OK)
  async refuserDevis(
    @Param('id', ParseIntPipe) id: number,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.facturationService.refuserDevis(
      BigInt(id),
      BigInt(utilisateur.id),
    );

    return {
      success: true,
      message: resultat.message,
      data: resultat.devis,
    };
  }

  @Get('factures')
  async listerFactures(
    @Query() filtre: FiltreFacturesEntrepriseDto,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.facturationService.listerMesFactures(
      BigInt(utilisateur.id),
      filtre,
    );

    return {
      success: true,
      message: 'Liste de vos factures récupérée avec succès.',
      data: resultat.elements,
      pagination: resultat.pagination,
    };
  }

  @Get('factures/:id')
  async obtenirFacture(
    @Param('id', ParseIntPipe) id: number,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const facture = await this.facturationService.obtenirFactureParId(
      BigInt(id),
      BigInt(utilisateur.id),
      utilisateur.role,
    );

    return {
      success: true,
      message: 'Détail de la facture récupéré avec succès.',
      data: facture,
    };
  }
}

