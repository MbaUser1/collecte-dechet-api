import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, validateSync } from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(Environment, { message: 'NODE_ENV doit être development, production ou test.' })
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsNumber({}, { message: 'PORT doit être un nombre.' })
  @IsOptional()
  PORT: number = 3000;

  @IsString({ message: 'DATABASE_URL doit être une chaîne de caractères.' })
  @IsOptional()
  DATABASE_URL?: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_SECRET?: string;

  @IsString()
  @IsOptional()
  JWT_REFRESH_SECRET?: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRES_IN: string = '15m';

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN: string = '30d';
}

export const VALEURS_DEMO_INTERDITES = [
  'secret',
  'secret-dev-insecure-change-in-production-collecte-dechets-api',
  'changeme',
  'password',
  '123456',
  'jwt_secret',
  'jwt-secret',
  'supersecret',
  'admin',
  'demo',
  'test',
];

export function estSecretFaibleOuInterdit(secret?: string): boolean {
  if (!secret) return true;
  const normalise = secret.trim().toLowerCase();
  if (normalise.length < 32) return true;
  for (const interdit of VALEURS_DEMO_INTERDITES) {
    if (normalise === interdit) {
      return true;
    }
  }
  if (
    normalise.includes('secret-dev') ||
    normalise.includes('changeme') ||
    normalise.includes('example') ||
    normalise.includes('insecure')
  ) {
    return true;
  }
  return false;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    const messages = errors.map((err) => Object.values(err.constraints || {}).join(', ')).join(' ; ');
    throw new Error(`Erreur de validation de configuration : ${messages}`);
  }

  // Durcissement strict pour l'environnement de production
  if (validatedConfig.NODE_ENV === Environment.Production) {
    // 1. DATABASE_URL obligatoire
    if (!validatedConfig.DATABASE_URL || validatedConfig.DATABASE_URL.trim().length === 0) {
      throw new Error(
        'Erreur de validation de configuration : DATABASE_URL est obligatoire en environnement de production.',
      );
    }

    // 2. JWT_ACCESS_SECRET obligatoire, robuste (min. 32 caractères) et non trivial
    if (!validatedConfig.JWT_ACCESS_SECRET || validatedConfig.JWT_ACCESS_SECRET.trim().length === 0) {
      throw new Error(
        'Erreur de validation de configuration : JWT_ACCESS_SECRET est obligatoire en environnement de production.',
      );
    }

    if (estSecretFaibleOuInterdit(validatedConfig.JWT_ACCESS_SECRET)) {
      throw new Error(
        'Erreur de validation de configuration : JWT_ACCESS_SECRET est trop court (min. 32 caractères) ou utilise une valeur de développement interdite en production.',
      );
    }

    // 3. Validation de JWT_REFRESH_SECRET si renseigné
    if (validatedConfig.JWT_REFRESH_SECRET && validatedConfig.JWT_REFRESH_SECRET.trim().length > 0) {
      if (estSecretFaibleOuInterdit(validatedConfig.JWT_REFRESH_SECRET)) {
        throw new Error(
          'Erreur de validation de configuration : JWT_REFRESH_SECRET est trop court (min. 32 caractères) ou utilise une valeur de développement interdite en production.',
        );
      }

      // 4. Les secrets d'accès et de rafraîchissement doivent être strictement indépendants
      if (validatedConfig.JWT_ACCESS_SECRET === validatedConfig.JWT_REFRESH_SECRET) {
        throw new Error(
          'Erreur de validation de configuration : JWT_ACCESS_SECRET et JWT_REFRESH_SECRET doivent être strictement distincts.',
        );
      }
    }
  }

  return validatedConfig;
}

