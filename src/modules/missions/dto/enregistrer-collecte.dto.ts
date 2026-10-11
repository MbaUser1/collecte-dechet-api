import {
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsOptional,
  IsBoolean,
  IsString,
  IsArray,
  ValidateNested,
  Min,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ElementCollecteItemDto {
  @IsNotEmpty({ message: 'L’identifiant du type de déchet est obligatoire.' })
  @Type(() => Number)
  @IsInt({ message: 'L’identifiant du type de déchet doit être un entier.' })
  @Min(1)
  type_dechet_id: number;

  @IsNotEmpty({ message: 'Le poids de l’élément est obligatoire.' })
  @Type(() => Number)
  @IsNumber({}, { message: 'Le poids doit être un nombre.' })
  @Min(0, { message: 'Le poids d’un élément ne peut pas être négatif.' })
  poids: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Le volume estimé doit être un nombre.' })
  @Min(0, { message: 'Le volume estimé ne peut pas être négatif.' })
  volume_estime?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class EnregistrerCollecteDto {
  @IsNotEmpty({ message: 'Le poids réel total est obligatoire.' })
  @Type(() => Number)
  @IsNumber({}, { message: 'Le poids réel total doit être un nombre.' })
  @IsPositive({ message: 'Le poids réel total doit être strictement positif.' })
  poids_reel_total: number;

  @IsOptional()
  @IsBoolean()
  tri_respecte?: boolean = true;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ElementCollecteItemDto)
  elements?: ElementCollecteItemDto[];
}

