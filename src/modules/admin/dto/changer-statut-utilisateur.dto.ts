import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { StatutUtilisateurEnum } from './filtre-admin-utilisateurs.dto.js';

export class ChangerStatutUtilisateurDto {
  @IsNotEmpty({ message: 'Le statut est obligatoire.' })
  @IsEnum(StatutUtilisateurEnum, { message: 'Statut utilisateur invalide.' })
  statut: StatutUtilisateurEnum;

  @IsOptional()
  @IsString({ message: 'Le motif doit être une chaîne de caractères.' })
  motif?: string;
}

