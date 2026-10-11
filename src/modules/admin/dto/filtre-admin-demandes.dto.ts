import { IsOptional, IsEnum, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export enum StatutDemandeCollecteEnum {
  EN_ATTENTE_PAIEMENT = 'EN_ATTENTE_PAIEMENT',
  PAYEE = 'PAYEE',
  EN_ATTENTE_ATTRIBUTION = 'EN_ATTENTE_ATTRIBUTION',
  ATTRIBUEE = 'ATTRIBUEE',
  EN_COURS = 'EN_COURS',
  TERMINEE = 'TERMINEE',
  ECHOUEE = 'ECHOUEE',
  ANNULEE = 'ANNULEE',
  FERMEE = 'FERMEE',
}

export class FiltreAdminDemandesDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(StatutDemandeCollecteEnum, { message: 'Statut de demande invalide.' })
  statut?: StatutDemandeCollecteEnum;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  zone_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  type_dechet_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  client_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  collecteur_id?: number;
}

