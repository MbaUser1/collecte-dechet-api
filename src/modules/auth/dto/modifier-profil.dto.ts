import { IsEmail, IsOptional, IsString } from 'class-validator';

export class ModifierProfilDto {
  @IsOptional()
  @IsString({ message: 'Le nom doit être une chaîne.' })
  nom?: string;

  @IsOptional()
  @IsEmail({}, { message: "L'adresse email n'est pas valide." })
  email?: string;

  @IsOptional()
  @IsString({ message: "L'URL de la photo doit être une chaîne." })
  photo?: string;
}

