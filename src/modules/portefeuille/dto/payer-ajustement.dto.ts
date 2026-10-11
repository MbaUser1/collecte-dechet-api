import { Type } from 'class-transformer';
import { IsNotEmpty, IsInt, Min } from 'class-validator';

export class PayerAjustementDto {
  @IsNotEmpty({ message: "L'identifiant de l'ajustement est obligatoire." })
  @Type(() => Number)
  @IsInt({ message: "L'identifiant de l'ajustement doit être un entier." })
  @Min(1, { message: "L'identifiant de l'ajustement doit être supérieur à 0." })
  ajustement_id!: number;
}

