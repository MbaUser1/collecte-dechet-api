import { IsBoolean, IsOptional } from 'class-validator';

export class ModifierPreferencesDto {
  @IsOptional()
  @IsBoolean({ message: 'email_actif doit être un booléen.' })
  email_actif?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'sms_actif doit être un booléen.' })
  sms_actif?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'push_actif doit être un booléen.' })
  push_actif?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'whatsapp_actif doit être un booléen.' })
  whatsapp_actif?: boolean;
}

