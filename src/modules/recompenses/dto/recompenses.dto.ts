import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsInt,
  Min,
  IsNumber,
  IsPositive,
  IsDate,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export class FiltreRecompensesDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  partenaire_id?: number;

  @IsOptional()
  @IsString()
  statut?: string;
}

export class FiltreTransactionsPointsDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  sens?: string;
}

export class CreerRecompenseDto {
  @IsNotEmpty({ message: 'Le partenaire est obligatoire.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  partenaire_id: number;

  @IsNotEmpty({ message: 'Le titre de la récompense est obligatoire.' })
  @IsString()
  titre: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty({ message: 'Le nombre de points requis est obligatoire.' })
  @Type(() => Number)
  @IsInt()
  @IsPositive({ message: 'Le nombre de points requis doit être strictement positif.' })
  points_requis: number;

  @IsNotEmpty({ message: 'Le stock initial est obligatoire.' })
  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'Le stock ne peut pas être négatif.' })
  stock: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valeur_monetaire?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date_debut?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date_fin?: Date;
}

export class ModifierRecompenseDto {
  @IsOptional()
  @IsString()
  titre?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  points_requis?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valeur_monetaire?: number;

  @IsOptional()
  @IsString()
  statut?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date_debut?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date_fin?: Date;
}

export class AjusterStockDto {
  @IsNotEmpty({ message: 'La quantité d’ajustement est obligatoire.' })
  @Type(() => Number)
  @IsInt({ message: 'La quantité doit être un entier.' })
  delta: number;
}

