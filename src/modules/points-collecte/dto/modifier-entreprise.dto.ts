import { IsOptional, IsString, MaxLength, IsEmail } from 'class-validator';

export class ModifierEntrepriseDto {
  @IsOptional()
  @IsString({ message: 'Le nom doit être une chaîne de caractères.' })
  @MaxLength(255, { message: 'Le nom ne doit pas dépasser 255 caractères.' })
  nom?: string;

  @IsOptional()
  @IsString({ message: 'La raison sociale doit être une chaîne de caractères.' })
  @MaxLength(255, { message: 'La raison sociale ne doit pas dépasser 255 caractères.' })
  raison_sociale?: string;

  @IsOptional()
  @IsString({ message: 'Le numéro d’enregistrement doit être une chaîne de caractères.' })
  @MaxLength(100, { message: 'Le numéro d’enregistrement ne doit pas dépasser 100 caractères.' })
  numero_enregistrement?: string;

  @IsOptional()
  @IsEmail({}, { message: "L'adresse email de l'entreprise n'est pas valide." })
  @MaxLength(255, { message: "L'email ne doit pas dépasser 255 caractères." })
  email?: string;

  @IsOptional()
  @IsString({ message: 'Le numéro de téléphone doit être une chaîne de caractères.' })
  @MaxLength(30, { message: 'Le numéro de téléphone ne doit pas dépasser 30 caractères.' })
  telephone?: string;
}

