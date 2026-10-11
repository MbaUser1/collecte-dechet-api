import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  IsIn,
  IsNumber,
  Min,
  IsDate,
  IsInt,
} from 'class-validator';

export class ModifierTarifDto {
  @IsOptional()
  @IsString({ message: 'Le nom doit être une chaîne de caractères.' })
  @MaxLength(150, { message: 'Le nom ne doit pas dépasser 150 caractères.' })
  nom?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "L'identifiant du type de déchet doit être un entier." })
  @Min(1, { message: "L'identifiant du type de déchet doit être supérieur à 0." })
  type_dechet_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "L'identifiant de la zone doit être un entier." })
  @Min(1, { message: "L'identifiant de la zone doit être supérieur à 0." })
  zone_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Le prix de base doit être un nombre.' })
  @Min(0, { message: 'Le prix de base ne peut pas être négatif.' })
  prix_base?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Le prix par kg doit être un nombre.' })
  @Min(0, { message: 'Le prix par kg ne peut pas être négatif.' })
  prix_par_kg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Le prix par km doit être un nombre.' })
  @Min(0, { message: 'Le prix par km ne peut pas être négatif.' })
  prix_par_km?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Le prix minimum doit être un nombre.' })
  @Min(0, { message: 'Le prix minimum ne peut pas être négatif.' })
  prix_minimum?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'La date de début doit être une date valide.' })
  date_debut?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'La date de fin doit être une date valide.' })
  date_fin?: Date;

  @IsOptional()
  @IsIn(['ACTIF', 'INACTIF'], { message: "Le statut doit être 'ACTIF' ou 'INACTIF'." })
  statut?: 'ACTIF' | 'INACTIF';
}

