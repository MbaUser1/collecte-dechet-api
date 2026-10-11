import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UtilisateurActuel } from '../auth/decorators/utilisateur-actuel.decorator.js';
import { SignalementsService } from './signalements.service.js';
import { CreerSignalementDto } from './dto/creer-signalement.dto.js';
import { FiltreSignalementsDto } from './dto/filtre-signalements.dto.js';

@Controller('signalements')
@UseGuards(JwtAuthGuard)
export class SignalementsController {
  constructor(private readonly signalementsService: SignalementsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async creerSignalement(
    @Body() dto: CreerSignalementDto,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.signalementsService.creerSignalement(dto, {
      id: BigInt(utilisateur.id),
      role: utilisateur.role,
    });

    return {
      success: true,
      message: resultat.message,
      data: resultat.signalement,
    };
  }

  @Get('me')
  async listerMesSignalements(
    @Query() filtre: FiltreSignalementsDto,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.signalementsService.listerMesSignalements(
      BigInt(utilisateur.id),
      filtre,
    );

    return {
      success: true,
      message: 'Vos signalements ont été récupérés avec succès.',
      data: resultat.elements,
      pagination: resultat.pagination,
    };
  }

  @Get('collectes-communautaires')
  async listerCollectesCommunautaires(
    @Query() filtre: FiltreSignalementsDto,
  ) {
    const resultat = await this.signalementsService.listerCollectesCommunautaires(filtre);

    return {
      success: true,
      message: 'Chantiers de collectes communautaires ouverts récupérés avec succès.',
      data: resultat.elements,
      pagination: resultat.pagination,
    };
  }

  @Post(':id/participer')
  @HttpCode(HttpStatus.OK)
  async participer(
    @Param('id', ParseIntPipe) id: number,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.signalementsService.participerCollecteCommunautaire(
      BigInt(id),
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

  @Get(':id')
  async obtenirSignalement(
    @Param('id', ParseIntPipe) id: number,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const signalement = await this.signalementsService.obtenirSignalementParId(
      BigInt(id),
      {
        id: BigInt(utilisateur.id),
        role: utilisateur.role,
      },
    );

    return {
      success: true,
      message: 'Signalement récupéré avec succès.',
      data: signalement,
    };
  }
}

