import { IsInt, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class AffecterCollecteurDto {
  @IsNotEmpty({ message: 'L identifiant du collecteur est obligatoire.' })
  @Type(() => Number)
  @IsInt({ message: 'L identifiant du collecteur doit être un entier.' })
  collecteur_id: number;
}

