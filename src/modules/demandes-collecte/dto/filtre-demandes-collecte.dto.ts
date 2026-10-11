import { IsOptional, IsIn } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export class FiltreDemandesCollecteDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(
    [
      'EN_ATTENTE_PAIEMENT',
      'PAYEE',
      'EN_ATTENTE_ATTRIBUTION',
      'ATTRIBUEE',
      'EN_COURS',
      'TERMINEE',
      'ECHOUEE',
      'ANNULEE',
      'FERMEE',
      'TOUS',
    ],
    { message: 'Statut de demande de collecte non reconnu.' },
  )
  statut?: string;
}

