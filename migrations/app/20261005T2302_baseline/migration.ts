#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/a86047b75c96b26f9435ac9e30689b9a02cae8cb11004f36d80b9f4822e12933/contract';
import endContract from '../../snapshots/a86047b75c96b26f9435ac9e30689b9a02cae8cb11004f36d80b9f4822e12933/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'tests',
        columns: [
          col('date_creation', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('nom', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
