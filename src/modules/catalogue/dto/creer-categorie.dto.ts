import { IsNotEmpty, IsOptional, IsString, MaxLength, IsIn } from 'class-validator';

export class CreerCategorieDto {
  @IsNotEmpty({ message: 'Le nom de la catégorie est obligatoire.' })
  @IsString({ message: 'Le nom doit être une chaîne de caractères.' })
  @MaxLength(150, { message: 'Le nom ne doit pas dépasser 150 caractères.' })
  nom!: string;

  @IsOptional()
  @IsString({ message: 'La description doit être une chaîne de caractères.' })
  description?: string;

  @IsOptional()
  @IsIn(['ACTIF', 'INACTIF'], { message: "Le statut doit être 'ACTIF' ou 'INACTIF'." })
  statut?: 'ACTIF' | 'INACTIF' = 'ACTIF';
}

