import { IsOptional, IsString, IsIn } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export class FiltreSignalementsDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['SOUMIS', 'EN_COURS_VERIFICATION', 'VALIDE', 'REJETE', 'NETTOYE', 'TOUS'])
  statut?: string;

  @IsOptional()
  @IsString()
  ville?: string;
}

