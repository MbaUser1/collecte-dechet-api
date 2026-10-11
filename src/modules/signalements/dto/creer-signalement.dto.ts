import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreerSignalementDto {
  @IsNotEmpty({ message: 'La description du signalement est obligatoire.' })
  @IsString({ message: 'La description doit être une chaîne de caractères.' })
  @MinLength(10, { message: 'La description doit comporter au moins 10 caractères.' })
  description: string;

  @IsNotEmpty({ message: 'L’adresse du signalement est obligatoire.' })
  @IsString({ message: 'L’adresse doit être une chaîne de caractères.' })
  @MaxLength(255)
  adresse: string;

  @IsNotEmpty({ message: 'La ville est obligatoire.' })
  @IsString({ message: 'La ville doit être une chaîne de caractères.' })
  @MaxLength(100)
  ville: string;

  @IsNotEmpty({ message: 'Le quartier est obligatoire.' })
  @IsString({ message: 'Le quartier doit être une chaîne de caractères.' })
  @MaxLength(100)
  quartier: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'La latitude doit être un nombre.' })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'La longitude doit être un nombre.' })
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsString()
  photo?: string;
}

