import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  IsIn,
  IsNumber,
  Min,
  IsInt,
} from 'class-validator';

export class ModifierPlanAbonnementDto {
  @IsOptional()
  @IsString({ message: 'Le nom doit être une chaîne de caractères.' })
  @MaxLength(150, { message: 'Le nom ne doit pas dépasser 150 caractères.' })
  nom?: string;

  @IsOptional()
  @IsString({ message: 'La description doit être une chaîne de caractères.' })
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Le prix doit être un nombre.' })
  @Min(0, { message: 'Le prix ne peut pas être négatif.' })
  prix?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La durée en jours doit être un entier.' })
  @Min(1, { message: 'La durée en jours doit être strictement supérieure à 0.' })
  duree_jours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Le nombre de collectes incluses doit être un entier.' })
  @Min(1, { message: 'Le nombre de collectes incluses doit être strictement supérieur à 0.' })
  nombre_collectes_incluses?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Le poids maximal par collecte doit être un nombre.' })
  @Min(0.01, { message: 'Le poids maximal par collecte doit être strictement supérieur à 0.' })
  poids_max_par_collecte?: number;

  @IsOptional()
  @IsIn(['ACTIF', 'INACTIF'], { message: "Le statut doit être 'ACTIF' ou 'INACTIF'." })
  statut?: 'ACTIF' | 'INACTIF';
}

