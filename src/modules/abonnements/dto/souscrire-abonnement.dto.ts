import { Type } from 'class-transformer';
import { IsNotEmpty, IsInt, Min } from 'class-validator';

export class SouscrireAbonnementDto {
  @IsNotEmpty({ message: "L'identifiant du plan d'abonnement est obligatoire." })
  @Type(() => Number)
  @IsInt({ message: "L'identifiant du plan d'abonnement doit être un entier." })
  @Min(1, { message: "L'identifiant du plan d'abonnement doit être supérieur à 0." })
  plan_abonnement_id!: number;
}

