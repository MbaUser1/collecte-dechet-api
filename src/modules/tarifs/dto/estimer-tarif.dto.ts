import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsDate,
  IsInt,
} from 'class-validator';

export class EstimerTarifDto {
  @IsNotEmpty({ message: "L'identifiant du type de déchet est obligatoire." })
  @Type(() => Number)
  @IsInt({ message: "L'identifiant du type de déchet doit être un entier." })
  @Min(1, { message: "L'identifiant du type de déchet doit être supérieur à 0." })
  type_dechet_id!: number;

  @IsNotEmpty({ message: "L'identifiant de la zone est obligatoire." })
  @Type(() => Number)
  @IsInt({ message: "L'identifiant de la zone doit être un entier." })
  @Min(1, { message: "L'identifiant de la zone doit être supérieur à 0." })
  zone_id!: number;

  @IsNotEmpty({ message: 'Le poids en kilogrammes est obligatoire.' })
  @Type(() => Number)
  @IsNumber({}, { message: 'Le poids doit être un nombre.' })
  @Min(0, { message: 'Le poids ne peut pas être négatif.' })
  poids_kg!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'La distance en kilomètres doit être un nombre.' })
  @Min(0, { message: 'La distance ne peut pas être négative.' })
  distance_km?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Les suppléments doivent être un nombre.' })
  @Min(0, { message: 'Les suppléments ne peuvent pas être négatifs.' })
  supplements_cfa?: number = 0;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'La date doit être une date valide.' })
  date?: Date;
}

