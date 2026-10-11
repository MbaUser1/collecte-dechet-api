import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsInt,
  IsDate,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreerDemandeCollecteDto {
  @IsNotEmpty({ message: 'L’identifiant du point de collecte est obligatoire.' })
  @Type(() => Number)
  @IsInt({ message: 'L’identifiant du point de collecte doit être un entier.' })
  @Min(1, { message: 'L’identifiant du point de collecte doit être supérieur à 0.' })
  point_collecte_id!: number;

  @IsNotEmpty({ message: 'L’identifiant du type de déchet est obligatoire.' })
  @Type(() => Number)
  @IsInt({ message: 'L’identifiant du type de déchet doit être un entier.' })
  @Min(1, { message: 'L’identifiant du type de déchet doit être supérieur à 0.' })
  type_dechet_id!: number;

  @IsNotEmpty({ message: 'Le poids estimé est obligatoire.' })
  @Type(() => Number)
  @IsNumber({}, { message: 'Le poids estimé doit être un nombre.' })
  @Min(0.1, { message: 'Le poids estimé doit être d’au moins 0.1 kg.' })
  @Max(10000, { message: 'Le poids estimé ne peut pas dépasser 10 000 kg.' })
  poids_estime!: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'La date de collecte souhaitée doit être une date valide.' })
  date_collecte_souhaitee?: Date;

  @IsOptional()
  @IsString({ message: 'Le créneau horaire doit être une chaîne de caractères.' })
  @MaxLength(50, { message: 'Le créneau horaire ne doit pas dépasser 50 caractères.' })
  creneau_horaire?: string;

  @IsOptional()
  @IsString({ message: 'Les instructions d’accès doivent être une chaîne de caractères.' })
  instructions_acces?: string;
}

