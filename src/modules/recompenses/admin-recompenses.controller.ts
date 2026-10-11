import {
  Controller,
  Post,
  Put,
  Patch,
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
import { RecompensesService } from './recompenses.service.js';
import {
  CreerRecompenseDto,
  ModifierRecompenseDto,
  AjusterStockDto,
} from './dto/recompenses.dto.js';

@Controller('admin/recompenses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMINISTRATEUR')
export class AdminRecompensesController {
  constructor(private readonly recompensesService: RecompensesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async creerRecompense(@Body() dto: CreerRecompenseDto) {
    const resultat = await this.recompensesService.creerRecompense(dto);

    return {
      success: true,
      message: resultat.message,
      data: resultat.recompense,
    };
  }

  @Put(':id')
  async modifierRecompense(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModifierRecompenseDto,
  ) {
    const resultat = await this.recompensesService.modifierRecompense(BigInt(id), dto);

    return {
      success: true,
      message: resultat.message,
      data: resultat.recompense,
    };
  }

  @Patch(':id/stock')
  async ajusterStock(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AjusterStockDto,
  ) {
    const resultat = await this.recompensesService.ajusterStock(BigInt(id), dto.delta);

    return {
      success: true,
      message: resultat.message,
      data: resultat.recompense,
    };
  }

  @Post('reclamations/:code/valider')
  @HttpCode(HttpStatus.OK)
  async validerReclamation(@Param('code') code: string) {
    const resultat = await this.recompensesService.validerUtilisationReclamation(code);

    return {
      success: true,
      message: resultat.message,
      data: resultat.reclamation,
    };
  }

  @Post('reclamations/:code/annuler')
  @HttpCode(HttpStatus.OK)
  async annulerReclamation(
    @Param('code') code: string,
    @Body('motif') motif?: string,
  ) {
    const resultat = await this.recompensesService.annulerReclamation(code, motif);

    return {
      success: true,
      message: resultat.message,
      data: resultat.reclamation,
    };
  }
}

