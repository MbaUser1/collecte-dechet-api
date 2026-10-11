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
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UtilisateurActuel } from '../auth/decorators/utilisateur-actuel.decorator.js';
import { SignalementsService } from './signalements.service.js';
import { FiltreSignalementsDto } from './dto/filtre-signalements.dto.js';
import {
  ValiderSignalementDto,
  RejeterSignalementDto,
  ResoudreSignalementDto,
} from './dto/actions-signalement.dto.js';

@Controller('admin/signalements')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMINISTRATEUR')
export class AdminSignalementsController {
  constructor(private readonly signalementsService: SignalementsService) {}

  @Get()
  async listerTous(@Query() filtre: FiltreSignalementsDto) {
    const resultat = await this.signalementsService.listerTousSignalementsAdmin(filtre);

    return {
      success: true,
      message: 'Liste administrative des signalements récupérée avec succès.',
      data: resultat.elements,
      pagination: resultat.pagination,
    };
  }

  @Get(':id')
  async obtenir(@Param('id', ParseIntPipe) id: number, @UtilisateurActuel() utilisateur: any) {
    const signalement = await this.signalementsService.obtenirSignalementParId(
      BigInt(id),
      {
        id: BigInt(utilisateur.id),
        role: utilisateur.role,
      },
    );

    return {
      success: true,
      message: 'Détail du signalement récupéré avec succès.',
      data: signalement,
    };
  }

  @Post(':id/valider')
  @HttpCode(HttpStatus.OK)
  async valider(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ValiderSignalementDto,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.signalementsService.validerSignalement(
      BigInt(id),
      dto,
      BigInt(utilisateur.id),
    );

    return {
      success: true,
      message: resultat.message,
      data: resultat.signalement,
    };
  }

  @Post(':id/rejeter')
  @HttpCode(HttpStatus.OK)
  async rejeter(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejeterSignalementDto,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.signalementsService.rejeterSignalement(
      BigInt(id),
      dto,
      BigInt(utilisateur.id),
    );

    return {
      success: true,
      message: resultat.message,
      data: resultat.signalement,
    };
  }

  @Post(':id/resoudre')
  @HttpCode(HttpStatus.OK)
  async resoudre(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResoudreSignalementDto,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const resultat = await this.signalementsService.resoudreSignalement(
      BigInt(id),
      dto,
      BigInt(utilisateur.id),
    );

    return {
      success: true,
      message: resultat.message,
      data: resultat.signalement,
    };
  }
}

