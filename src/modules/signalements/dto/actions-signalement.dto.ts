import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ValiderSignalementDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Les points doivent être un entier.' })
  @Min(0)
  points_a_attribuer?: number;

  @IsOptional()
  @IsString()
  notes_administrateur?: string;
}

export class RejeterSignalementDto {
  @IsNotEmpty({ message: 'Le motif de rejet est obligatoire.' })
  @IsString({ message: 'Le motif de rejet doit être une chaîne de caractères.' })
  @MaxLength(255)
  motif: string;

  @IsOptional()
  @IsString()
  notes_administrateur?: string;
}

export class ResoudreSignalementDto {
  @IsNotEmpty({ message: 'Le nombre de points à attribuer est obligatoire pour la résolution.' })
  @Type(() => Number)
  @IsInt({ message: 'Les points doivent être un nombre entier.' })
  @Min(1, { message: 'Le nombre de points doit être supérieur à 0.' })
  points_a_attribuer: number;

  @IsOptional()
  @IsString()
  notes_administrateur?: string;
}

