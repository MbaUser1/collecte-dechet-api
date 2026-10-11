import { IsOptional, IsIn } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export class FiltrePlansAbonnementDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['ACTIF', 'INACTIF', 'TOUS'], {
    message: "Le statut doit être 'ACTIF', 'INACTIF' ou 'TOUS'.",
  })
  statut?: string = 'ACTIF';
}

