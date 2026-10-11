import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, IsIn, IsInt, Min } from 'class-validator';

export class ModifierTypeDechetDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "L'identifiant de la catégorie doit être un entier." })
  @Min(1, { message: "L'identifiant de la catégorie doit être supérieur à 0." })
  categorie_dechet_id?: number;

  @IsOptional()
  @IsString({ message: 'Le nom doit être une chaîne de caractères.' })
  @MaxLength(150, { message: 'Le nom ne doit pas dépasser 150 caractères.' })
  nom?: string;

  @IsOptional()
  @IsString({ message: 'La description doit être une chaîne de caractères.' })
  description?: string;

  @IsOptional()
  @IsIn(['ACTIF', 'INACTIF'], { message: "Le statut doit être 'ACTIF' ou 'INACTIF'." })
  statut?: 'ACTIF' | 'INACTIF';
}

