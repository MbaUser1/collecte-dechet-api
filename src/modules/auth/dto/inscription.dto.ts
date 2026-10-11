import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class InscriptionDto {
  @IsNotEmpty({ message: 'Le nom est obligatoire.' })
  @IsString({ message: 'Le nom doit être une chaîne de caractères.' })
  nom: string;

  @IsNotEmpty({ message: 'Le numéro de téléphone est obligatoire.' })
  @IsString({ message: 'Le numéro de téléphone doit être une chaîne de caractères.' })
  telephone: string;

  @IsOptional()
  @IsEmail({}, { message: "L'adresse email n'est pas valide." })
  email?: string;

  @IsNotEmpty({ message: 'Le mot de passe est obligatoire.' })
  @MinLength(8, { message: 'Le mot de passe doit comporter au moins 8 caractères.' })
  mot_de_passe: string;

  @IsNotEmpty({ message: 'Le rôle est obligatoire.' })
  @IsIn(['PARTICULIER', 'ENTREPRISE'], {
    message: "Seuls les rôles 'PARTICULIER' et 'ENTREPRISE' sont autorisés à l'inscription publique.",
  })
  role: 'PARTICULIER' | 'ENTREPRISE';

  @IsOptional()
  @IsString({ message: 'La raison sociale doit être une chaîne.' })
  raison_sociale?: string;

  @IsOptional()
  @IsString({ message: 'Le numéro d’enregistrement doit être une chaîne.' })
  numero_enregistrement?: string;
}

