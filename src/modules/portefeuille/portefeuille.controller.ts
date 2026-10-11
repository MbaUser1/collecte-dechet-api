import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UtilisateurActuel } from '../auth/decorators/utilisateur-actuel.decorator.js';
import { PortefeuilleService } from './portefeuille.service.js';
import { FiltreTransactionsDto } from './dto/filtre-transactions.dto.js';
import { RechargerPortefeuilleDto } from './dto/recharger-portefeuille.dto.js';
import { PayerAjustementDto } from './dto/payer-ajustement.dto.js';
import { PaiementsService } from '../paiements/services/paiements.service.js';
import { AjustementsService } from '../ajustements/ajustements.service.js';

@Controller('portefeuille')
@UseGuards(JwtAuthGuard)
export class PortefeuilleController {
  constructor(
    private readonly portefeuilleService: PortefeuilleService,
    @Inject(forwardRef(() => PaiementsService))
    private readonly paiementsService: PaiementsService,
    private readonly ajustementsService: AjustementsService,
  ) {}

  @Get('me')
  async consulterPortefeuille(@UtilisateurActuel() utilisateur: any) {
    const data = await this.portefeuilleService.consulterPortefeuille({
      id: BigInt(utilisateur.id),
      role: utilisateur.role,
    });

    return {
      success: true,
      message: 'Portefeuille récupéré avec succès.',
      data,
    };
  }

  @Get('me/transactions')
  async listerTransactions(
    @Query() filtre: FiltreTransactionsDto,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.portefeuilleService.listerTransactions(
      {
        id: BigInt(utilisateur.id),
        role: utilisateur.role,
      },
      filtre,
    );

    return {
      success: true,
      message: 'Historique des transactions récupéré avec succès.',
      data: resultat.elements,
      pagination: resultat.pagination,
    };
  }

  @Post('me/recharger')
  @HttpCode(HttpStatus.OK)
  async recharger(
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

  @Post('me/payer-ajustement')
  @HttpCode(HttpStatus.OK)
  async payerAjustement(
    @Body() dto: PayerAjustementDto,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.ajustementsService.reglerAjustementParPortefeuille(
      BigInt(dto.ajustement_id),
      {
        id: BigInt(utilisateur.id),
        role: utilisateur.role,
      },
    );

    return {
      success: true,
      message: resultat.message,
      data: resultat,
    };
  }
}

