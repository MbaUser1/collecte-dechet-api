import { IsOptional, IsIn } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export class FiltreAbonnementsDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['EN_ATTENTE_PAIEMENT', 'ACTIF', 'EXPIRE', 'ANNULE', 'SUSPENDU', 'TOUS'], {
    message: "Statut d'abonnement non reconnu.",
  })
  statut?: string;
}

