import { IsOptional, IsIn } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export class FiltreTransactionsDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['CREDIT', 'DEBIT', 'TOUS'], {
    message: "Le sens de la transaction doit être 'CREDIT', 'DEBIT' ou 'TOUS'.",
  })
  sens?: 'CREDIT' | 'DEBIT' | 'TOUS';
}

