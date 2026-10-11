import { Type } from 'class-transformer';
import { IsNotEmpty, IsInt, Min, IsIn, IsOptional, IsString } from 'class-validator';

export class PayerAbonnementDto {
  @IsNotEmpty({ message: 'L’identifiant de l’abonnement est obligatoire.' })
  @Type(() => Number)
  @IsInt({ message: 'L’identifiant de l’abonnement doit être un entier.' })
  @Min(1, { message: 'L’identifiant de l’abonnement doit être supérieur à 0.' })
  abonnement_id!: number;

  @IsNotEmpty({ message: 'La méthode de paiement est obligatoire.' })
  @IsIn(
    [
      'PORTEFEUILLE',
      'MTN_MOMO',
      'ORANGE_MONEY',
      'CARTE_BANCAIRE',
      'VIREMENT_BANCAIRE',
      'ESPECES',
    ],
    { message: 'Méthode de paiement non autorisée.' },
  )
  methode!:
    | 'PORTEFEUILLE'
    | 'MTN_MOMO'
    | 'ORANGE_MONEY'
    | 'CARTE_BANCAIRE'
    | 'VIREMENT_BANCAIRE'
    | 'ESPECES';

  @IsOptional()
  @IsString({ message: 'Le numéro de téléphone payeur doit être une chaîne.' })
  telephone_payeur?: string;
}

