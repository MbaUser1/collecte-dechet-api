import { IsNotEmpty, IsString } from 'class-validator';

export class RafraichirDto {
  @IsNotEmpty({ message: 'Le jeton de rafraîchissement est obligatoire.' })
  @IsString({ message: 'Le jeton de rafraîchissement doit être une chaîne.' })
  refresh_token: string;
}

