import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
} from '@nestjs/common';
import { EntrepriseService } from './services/entreprise.service.js';
import { ModifierEntrepriseDto } from './dto/modifier-entreprise.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UtilisateurActuel } from '../auth/decorators/utilisateur-actuel.decorator.js';

@Controller('entreprises')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ENTREPRISE')
export class EntreprisesController {
  constructor(private readonly entrepriseService: EntrepriseService) {}

  @Get('me')
  async obtenirProfil(@UtilisateurActuel() utilisateur: any) {
    const entreprise = await this.entrepriseService.obtenirProfilEntreprise(
      BigInt(utilisateur.id),
    );
    return {
      success: true,
      message: 'Profil entreprise récupéré avec succès.',
      data: entreprise,
    };
  }

  @Patch('me')
  async modifierProfil(
    @Body() dto: ModifierEntrepriseDto,
    @UtilisateurActuel() utilisateur: any,
  ) {
    const entreprise = await this.entrepriseService.modifierProfilEntreprise(
      BigInt(utilisateur.id),
      dto,
    );
    return {
      success: true,
      message: 'Profil entreprise mis à jour avec succès.',
      data: entreprise,
    };
  }
}

