
import 'temporal-polyfill/full/global';

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from './contract.d.js';
import contractJson from './contract.json' with { type: 'json' };

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  public readonly client: ReturnType<typeof postgres<Contract>>;

  constructor(private readonly configService: ConfigService) {
    const databaseUrl = this.configService.get<string>('DATABASE_URL');
    if (!databaseUrl) {
      this.logger.warn('DATABASE_URL non configuré. Les requêtes à la base échoueront.');
    }

    this.client = postgres<Contract>({
      contractJson,
      url: databaseUrl,
    });
  }

  get orm() {
    return this.client.orm;
  }

  get sql() {
    return this.client.sql;
  }

  async transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    if (typeof this.client?.transaction === 'function') {
      return this.client.transaction(fn);
    }
    return fn(this);
  }

  async onModuleInit() {
    this.logger.log('PrismaService initialisé (connexion paresseuse Prisma 8).');
  }

  async onModuleDestroy() {
    if (this.client?.close) {
      await this.client.close();
      this.logger.log('Connexion Prisma fermée.');
    }
  }
}

