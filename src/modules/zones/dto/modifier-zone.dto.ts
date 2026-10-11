import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  IsIn,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export class ModifierZoneDto {
  @IsOptional()
  @IsString({ message: 'Le nom doit être une chaîne de caractères.' })
  @MaxLength(150, { message: 'Le nom ne doit pas dépasser 150 caractères.' })
  nom?: string;

  @IsOptional()
  @IsString({ message: 'La ville doit être une chaîne de caractères.' })
  @MaxLength(100, { message: 'La ville ne doit pas dépasser 100 caractères.' })
  ville?: string;

  @IsOptional()
  @IsString({ message: 'La description doit être une chaîne de caractères.' })
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'La latitude doit être un nombre.' })
  @Min(-90, { message: 'La latitude doit être comprise entre -90 et 90.' })
  @Max(90, { message: 'La latitude doit être comprise entre -90 et 90.' })
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'La longitude doit être un nombre.' })
  @Min(-180, { message: 'La longitude doit être comprise entre -180 et 180.' })
  @Max(180, { message: 'La longitude doit être comprise entre -180 et 180.' })
  longitude?: number;

  @IsOptional()
  @IsIn(['ACTIF', 'INACTIF'], { message: "Le statut doit être 'ACTIF' ou 'INACTIF'." })
  statut?: 'ACTIF' | 'INACTIF';
}

