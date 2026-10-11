import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsInt,
  Min,
  IsIn,
  IsOptional,
  IsNumber,
  IsString,
} from 'class-validator';

export class PayerFactureDto {
  @IsNotEmpty({ message: 'L’identifiant de la facture est obligatoire.' })
  @Type(() => Number)
  @IsInt({ message: 'L’identifiant de la facture doit être un entier.' })
  @Min(1, { message: 'L’identifiant de la facture doit être supérieur à 0.' })
  facture_id!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Le montant doit être un nombre.' })
  @Min(1, { message: 'Le montant payé doit être supérieur à 0.' })
  montant?: number;

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

