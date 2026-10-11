import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangerMotDePasseDto {
  @IsNotEmpty({ message: "L'ancien mot de passe est obligatoire." })
  @IsString({ message: "L'ancien mot de passe doit être une chaîne." })
  ancien_mot_de_passe: string;

  @IsNotEmpty({ message: 'Le nouveau mot de passe est obligatoire.' })
  @MinLength(8, { message: 'Le nouveau mot de passe doit comporter au moins 8 caractères.' })
  nouveau_mot_de_passe: string;
}

