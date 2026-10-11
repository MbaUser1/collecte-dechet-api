import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min, IsString, IsIn } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La page doit être un entier positif.' })
  @Min(1, { message: 'La page doit être supérieure ou égale à 1.' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La limite doit être un entier positif.' })
  @Min(1, { message: 'La limite doit être supérieure ou égale à 1.' })
  @Max(100, { message: 'La limite maximale autorisée est de 100 éléments par page.' })
  limite: number = 20;

  @IsOptional()
  @IsString({ message: 'Le terme de recherche doit être une chaîne.' })
  recherche?: string;

  @IsOptional()
  @IsString({ message: 'Le champ de tri doit être une chaîne.' })
  trier_par?: string;

  @IsOptional()
  @IsIn(['asc', 'desc', 'ASC', 'DESC'], { message: "L'ordre doit être 'asc' ou 'desc'." })
  ordre?: 'asc' | 'desc' | 'ASC' | 'DESC' = 'desc';

  get offset(): number {
    return (this.page - 1) * this.limite;
  }
}

export interface ResultatPagine<T> {
  elements: T[];
  pagination: {
    total: number;
    page: number;
    limite: number;
    pages_totales: number;
  };
}

export function validerChampTri(
  trierPar: string | undefined,
  champsAutorises: string[],
  champParDefaut: string,
): string {
  if (trierPar && champsAutorises.includes(trierPar)) {
    return trierPar;
  }
  return champParDefaut;
}

