import { IsOptional, IsIn } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export class FiltrePaiementsDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(
    [
      'EN_ATTENTE',
      'EN_COURS',
      'PAYE',
      'ECHOUE',
      'ANNULE',
      'REMBOURSE',
      'REMBOURSE_PARTIELLEMENT',
      'TOUS',
    ],
    { message: 'Statut de paiement non reconnu.' },
  )
  statut?: string;

  @IsOptional()
  @IsIn(['COLLECTE', 'ABONNEMENT', 'RECHARGEMENT_PORTEFEUILLE', 'FACTURE', 'TOUS'], {
    message: 'Type de paiement non reconnu.',
  })
  type?: string;
}

