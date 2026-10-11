import { IsOptional, IsEnum, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export enum RoleUtilisateurEnum {
  PARTICULIER = 'PARTICULIER',
  ENTREPRISE = 'ENTREPRISE',
  COLLECTEUR = 'COLLECTEUR',
  ADMINISTRATEUR = 'ADMINISTRATEUR',
}

export enum StatutUtilisateurEnum {
  ACTIF = 'ACTIF',
  SUSPENDU = 'SUSPENDU',
  INACTIF = 'INACTIF',
}

export class FiltreAdminUtilisateursDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(RoleUtilisateurEnum, { message: 'Rôle invalide.' })
  role?: RoleUtilisateurEnum;

  @IsOptional()
  @IsEnum(StatutUtilisateurEnum, { message: 'Statut utilisateur invalide.' })
  statut?: StatutUtilisateurEnum;
}
