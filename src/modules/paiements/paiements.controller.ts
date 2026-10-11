import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UtilisateurActuel } from '../auth/decorators/utilisateur-actuel.decorator.js';
import { PaiementsService } from './services/paiements.service.js';
import { PayerCollecteDto } from './dto/payer-collecte.dto.js';
import { PayerAbonnementDto } from './dto/payer-abonnement.dto.js';
import { PayerFactureDto } from './dto/payer-facture.dto.js';
import { RechargerPortefeuilleDto } from '../portefeuille/dto/recharger-portefeuille.dto.js';
import { FiltrePaiementsDto } from './dto/filtre-paiements.dto.js';

@Controller('paiements')
export class PaiementsController {
  constructor(private readonly paiementsService: PaiementsService) {}

  @Post('collecte')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async payerCollecte(
    @Body() dto: PayerCollecteDto,
    @UtilisateurActuel() utilisateur: any,
    @Headers('x-idempotency-key') cleIdempotence1?: string,
    @Headers('idempotency-key') cleIdempotence2?: string,
  ) {
    const cleIdempotence = cleIdempotence1 || cleIdempotence2;
    const resultat = await this.paiementsService.payerCollecte(
      dto,
      {
        id: BigInt(utilisateur.id),
        role: utilisateur.role,
      },
      cleIdempotence,
    );

    return {
      success: true,
      message: resultat.message,
      data: resultat,
    };
  }

  @Post('abonnement')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async payerAbonnement(
    @Body() dto: PayerAbonnementDto,
    @UtilisateurActuel() utilisateur: any,
    @Headers('x-idempotency-key') cleIdempotence1?: string,
    @Headers('idempotency-key') cleIdempotence2?: string,
  ) {
    const cleIdempotence = cleIdempotence1 || cleIdempotence2;
    const resultat = await this.paiementsService.payerAbonnement(
      dto,
      {
        id: BigInt(utilisateur.id),
        role: utilisateur.role,
      },
      cleIdempotence,
    );

    return {
      success: true,
      message: resultat.message,
      data: resultat,
    };
  }

  @Post('rechargement-portefeuille')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async rechargerPortefeuille(
    @Body() dto: RechargerPortefeuilleDto,
    @UtilisateurActuel() utilisateur: any,
    @Headers('x-idempotency-key') cleIdempotence1?: string,
    @Headers('idempotency-key') cleIdempotence2?: string,
  ) {
    const cleIdempotence = cleIdempotence1 || cleIdempotence2;
    const resultat = await this.paiementsService.rechargerPortefeuille(
      dto,
      {
        id: BigInt(utilisateur.id),
        role: utilisateur.role,
      },
      cleIdempotence,
    );

    return {
      success: true,
      message: resultat.message,
      data: resultat,
    };
  }

  @Post('facture')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async payerFacture(
    @Body() dto: PayerFactureDto,
    @UtilisateurActuel() utilisateur: any,
    @Headers('x-idempotency-key') cleIdempotence1?: string,
    @Headers('idempotency-key') cleIdempotence2?: string,
  ) {
    const cleIdempotence = cleIdempotence1 || cleIdempotence2;
    const resultat = await this.paiementsService.payerFacture(
      dto,
      {
        id: BigInt(utilisateur.id),
        role: utilisateur.role,
      },
      cleIdempotence,
    );

    return {
      success: true,
      message: resultat.message,
      data: resultat,
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async listerMesPaiements(
    @Query() filtre: FiltrePaiementsDto,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.paiementsService.listerMesPaiements(
      {
        id: BigInt(utilisateur.id),
        role: utilisateur.role,
      },
      filtre,
    );

    return {
      success: true,
      message: 'Historique des paiements récupéré avec succès.',
      data: resultat.elements,
      pagination: resultat.pagination,
    };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async obtenirPaiement(
    @Param('id', ParseIntPipe) id: number,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const paiement = await this.paiementsService.obtenirPaiementParId(
      BigInt(id),
      {
        id: BigInt(utilisateur.id),
        role: utilisateur.role,
      },
    );

    return {
      success: true,
      message: 'Détail du paiement récupéré avec succès.',
      data: paiement,
    };
  }

  @Post('webhook/:fournisseur')
  @HttpCode(HttpStatus.OK)
  async traiterWebhook(
    @Param('fournisseur') fournisseur: string,
    @Headers('x-signature') signature1: string,
    @Headers('x-webhook-signature') signature2: string,
    @Body() payload: any,
  ) {
    const signature = signature1 || signature2 || '';
    const resultat = await this.paiementsService.traiterWebhook(
      fournisseur,
      signature,
      payload,
    );

    return {
      success: true,
      data: resultat,
    };
  }
}

