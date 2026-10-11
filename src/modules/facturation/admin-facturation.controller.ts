import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { FacturationService } from './facturation.service.js';
import {
  CreerDevisDto,
  CreerFactureDirecteDto,
} from './dto/facturation.dto.js';

@Controller('admin/facturation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMINISTRATEUR')
export class AdminFacturationController {
  constructor(private readonly facturationService: FacturationService) {}

  @Post('devis')
  @HttpCode(HttpStatus.CREATED)
  async creerDevis(@Body() dto: CreerDevisDto) {
    const resultat = await this.facturationService.creerDevis(dto);

    return {
      success: true,
      message: resultat.message,
      data: resultat.devis,
    };
  }

  @Post('devis/:id/emettre')
  @HttpCode(HttpStatus.OK)
  async emettreDevis(@Param('id', ParseIntPipe) id: number) {
    const resultat = await this.facturationService.emettreDevis(BigInt(id));

    return {
      success: true,
      message: resultat.message,
      data: resultat.devis,
    };
  }

  @Post('factures')
  @HttpCode(HttpStatus.CREATED)
  async creerFactureDirecte(@Body() dto: CreerFactureDirecteDto) {
    const resultat = await this.facturationService.creerFactureDirecte(dto);

    return {
      success: true,
      message: resultat.message,
      data: resultat.facture,
    };
  }
}

