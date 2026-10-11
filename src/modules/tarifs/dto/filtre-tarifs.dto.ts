import { Type } from 'class-transformer';
import { IsOptional, IsIn, IsInt, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export class FiltreTarifsDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "L'identifiant du type de déchet doit être un entier." })
  @Min(1, { message: "L'identifiant du type de déchet doit être supérieur à 0." })
  type_dechet_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "L'identifiant de la zone doit être un entier." })
  @Min(1, { message: "L'identifiant de la zone doit être supérieur à 0." })
  zone_id?: number;

  @IsOptional()
  @IsIn(['ACTIF', 'INACTIF', 'TOUS'], {
    message: "Le statut doit être 'ACTIF', 'INACTIF' ou 'TOUS'.",
  })
  statut?: string = 'ACTIF';
}

