import { IsNotEmpty, IsUUID, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ScannerQrDto {
  @IsNotEmpty({ message: 'Le jeton QR est obligatoire.' })
  @IsUUID('all', { message: 'Le jeton QR doit être un UUID valide.' })
  jeton_qr: string;

  @IsNotEmpty({ message: 'La latitude est obligatoire.' })
  @Type(() => Number)
  @IsNumber({}, { message: 'La latitude doit être un nombre.' })
  @Min(-90, { message: 'La latitude doit être comprise entre -90 et 90.' })
  @Max(90, { message: 'La latitude doit être comprise entre -90 et 90.' })
  latitude: number;

  @IsNotEmpty({ message: 'La longitude est obligatoire.' })
  @Type(() => Number)
  @IsNumber({}, { message: 'La longitude doit être un nombre.' })
  @Min(-180, { message: 'La longitude doit être comprise entre -180 et 180.' })
  @Max(180, { message: 'La longitude doit être comprise entre -180 et 180.' })
  longitude: number;
}

