import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsDate, IsInt, Min } from 'class-validator';

export class TarifApplicableQueryDto {
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

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'La date doit être une date valide.' })
  date?: Date;
}

