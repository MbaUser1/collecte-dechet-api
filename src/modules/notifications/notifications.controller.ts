import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { FiltreNotificationsDto } from './dto/filtre-notifications.dto.js';
import { ModifierPreferencesDto } from './dto/modifier-preferences.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UtilisateurActuel } from '../auth/decorators/utilisateur-actuel.decorator.js';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('me')
  async listerMesNotifications(
    @UtilisateurActuel('id') utilisateurId: string,
    @Query() filtre: FiltreNotificationsDto,
  ) {
    const resultat = await this.notificationsService.listerMesNotifications(
      BigInt(utilisateurId),
      filtre,
    );
    return {
      success: true,
      message: 'Notifications récupérées avec succès.',
      data: resultat.elements,
      pagination: resultat.pagination,
    };
  }

  @Get('me/non-lues')
  async compterNonLues(@UtilisateurActuel('id') utilisateurId: string) {
    const data = await this.notificationsService.compterNonLues(BigInt(utilisateurId));
    return {
      success: true,
      message: 'Nombre de notifications non lues récupéré.',
      data,
    };
  }

  @Patch('me/lues')
  async marquerToutesCommeLues(@UtilisateurActuel('id') utilisateurId: string) {
    const data = await this.notificationsService.marquerToutesCommeLues(BigInt(utilisateurId));
    return {
      success: true,
      message: data.message,
      data,
    };
  }

  @Patch(':id/lue')
  async marquerCommeLue(
    @UtilisateurActuel('id') utilisateurId: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const data = await this.notificationsService.marquerCommeLue(
      BigInt(utilisateurId),
      BigInt(id),
    );
    return {
      success: true,
      message: 'Notification marquée comme lue.',
      data,
    };
  }

  @Get('preferences')
  async obtenirPreferences(@UtilisateurActuel('id') utilisateurId: string) {
    const data = await this.notificationsService.obtenirPreferences(BigInt(utilisateurId));
    return {
      success: true,
      message: 'Préférences de notification récupérées.',
      data,
    };
  }

  @Patch('preferences')
  async modifierPreferences(
    @UtilisateurActuel('id') utilisateurId: string,
    @Body() dto: ModifierPreferencesDto,
  ) {
    const data = await this.notificationsService.modifierPreferences(
      BigInt(utilisateurId),
      dto,
    );
    return {
      success: true,
      message: 'Préférences de notification mises à jour.',
      data,
    };
  }
}

