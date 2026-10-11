import { IsOptional, IsIn } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export class FiltreMissionsCollecteurDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['ATTRIBUEE', 'EN_COURS', 'TERMINEE', 'ECHOUEE', 'ANNULEE', 'TOUS'])
  statut?: string;
}

