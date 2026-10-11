import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  Min,
  IsInt,
  IsDate,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export class FiltreDevisDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  statut?: string;
}

export class FiltreFacturesEntrepriseDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  statut?: string;
}

export class CreerDevisDto {
  @IsNotEmpty({ message: 'L’identifiant de l’entreprise est obligatoire.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  entreprise_id: number;

  @IsNotEmpty({ message: 'Le montant HT est obligatoire.' })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Le montant HT doit être positif.' })
  montant_ht: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  montant_tva?: number = 0;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty({ message: 'La date de validité est obligatoire.' })
  @Type(() => Date)
  @IsDate({ message: 'La date de validité doit être une date valide.' })
  date_validite: Date;
}

export class CreerFactureDirecteDto {
  @IsNotEmpty({ message: 'L’identifiant de l’entreprise est obligatoire.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  entreprise_id: number;

  @IsNotEmpty({ message: 'Le montant HT est obligatoire.' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  montant_ht: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  montant_tva?: number = 0;

  @IsNotEmpty({ message: 'La date d’échéance est obligatoire.' })
  @Type(() => Date)
  @IsDate({ message: 'La date d’échéance doit être une date valide.' })
  date_echeance: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  devis_id?: number;

  @IsOptional()
  @IsString()
  url_document?: string;
}

