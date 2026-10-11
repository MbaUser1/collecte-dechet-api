import { IsOptional, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export class FiltreCollectesDisponiblesDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  ville?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  type_dechet_id?: number;
}

