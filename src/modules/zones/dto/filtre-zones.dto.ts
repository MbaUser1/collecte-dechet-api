import { IsOptional, IsString, IsIn } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export class FiltreZonesDto extends PaginationQueryDto {
  @IsOptional()
  @IsString({ message: 'La ville de filtre doit être une chaîne.' })
  ville?: string;

  @IsOptional()
  @IsIn(['ACTIF', 'INACTIF', 'TOUS'], {
    message: "Le statut doit être 'ACTIF', 'INACTIF' ou 'TOUS'.",
  })
  statut?: string = 'ACTIF';
}

