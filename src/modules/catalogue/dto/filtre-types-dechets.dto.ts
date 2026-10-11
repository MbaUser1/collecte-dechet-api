import { Type } from 'class-transformer';
import { IsOptional, IsIn, IsInt, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export class FiltreTypesDechetsDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "L'identifiant de la catégorie doit être un entier." })
  @Min(1, { message: "L'identifiant de la catégorie doit être supérieur à 0." })
  categorie_dechet_id?: number;

  @IsOptional()
  @IsIn(['ACTIF', 'INACTIF', 'TOUS'], {
    message: "Le statut doit être 'ACTIF', 'INACTIF' ou 'TOUS'.",
  })
  statut?: string = 'ACTIF';
}

