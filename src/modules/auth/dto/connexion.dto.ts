import { IsNotEmpty, IsString } from 'class-validator';

export class ConnexionDto {
  @IsNotEmpty({ message: "L'identifiant (téléphone ou email) est obligatoire." })
  @IsString({ message: "L'identifiant doit être une chaîne de caractères." })
  identifiant: string;

  @IsNotEmpty({ message: 'Le mot de passe est obligatoire.' })
  @IsString({ message: 'Le mot de passe doit être une chaîne de caractères.' })
  mot_de_passe: string;
}

