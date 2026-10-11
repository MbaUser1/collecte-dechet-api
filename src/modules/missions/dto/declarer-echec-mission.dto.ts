import { IsNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator';

export class DeclarerEchecMissionDto {
  @IsNotEmpty({ message: 'Le motif d’échec est obligatoire.' })
  @IsString({ message: 'Le motif d’échec doit être une chaîne de caractères.' })
  @MaxLength(255, { message: 'Le motif d’échec ne peut pas dépasser 255 caractères.' })
  motif: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

