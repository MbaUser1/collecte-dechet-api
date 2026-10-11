import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, Min, IsIn, IsOptional, IsString } from 'class-validator';

export class RechargerPortefeuilleDto {
  @IsNotEmpty({ message: 'Le montant de la recharge est obligatoire.' })
  @Type(() => Number)
  @IsNumber({}, { message: 'Le montant doit être un nombre.' })
  @Min(100, { message: 'Le montant minimal de recharge est de 100 FCFA.' })
  montant!: number;

  @IsNotEmpty({ message: 'La méthode de paiement est obligatoire.' })
  @IsIn(
    [
      'MTN_MOMO',
      'ORANGE_MONEY',
      'CARTE_BANCAIRE',
      'VIREMENT_BANCAIRE',
      'ESPECES',
    ],
    { message: 'Méthode de rechargement non autorisée.' },
  )
  methode!:
    | 'MTN_MOMO'
    | 'ORANGE_MONEY'
    | 'CARTE_BANCAIRE'
    | 'VIREMENT_BANCAIRE'
    | 'ESPECES';

  @IsOptional()
  @IsString({ message: 'Le numéro de téléphone payeur doit être une chaîne.' })
  telephone_payeur?: string;
}

