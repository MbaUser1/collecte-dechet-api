#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/3ed94ade78130c99f73f3eacea1d321bf12d8714255b4e1f4d24e6cc106de7ef/contract';
import endContract from '../../snapshots/3ed94ade78130c99f73f3eacea1d321bf12d8714255b4e1f4d24e6cc106de7ef/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/a86047b75c96b26f9435ac9e30689b9a02cae8cb11004f36d80b9f4822e12933/contract';
import startContract from '../../snapshots/a86047b75c96b26f9435ac9e30689b9a02cae8cb11004f36d80b9f4822e12933/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropTable({ schema: 'public', table: 'tests' }),
      this.createTable({
        schema: 'public',
        table: 'entreprises',
        columns: [
          col('date_creation', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('date_modification', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('email', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('nom', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('numero_enregistrement', 'character varying(100)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('raison_sociale', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('statut', 'character varying(30)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 30 } },
          }),
          col('telephone', 'character varying(30)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 30 } },
          }),
          col('utilisateur_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'points_collecte',
        columns: [
          col('adresse', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('date_creation', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('date_modification', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('entreprise_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('instructions_acces', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('jeton_qr', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('latitude', 'float4', { codecRef: { codecId: 'pg/float4@1' } }),
          col('longitude', 'float4', { codecRef: { codecId: 'pg/float4@1' } }),
          col('nom', 'character varying(150)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 150 } },
          }),
          col('quartier', 'character varying(100)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('statut', 'character varying(30)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 30 } },
          }),
          col('utilisateur_id', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
          col('ville', 'character varying(100)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'portefeuilles',
        columns: [
          col('date_creation', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('date_modification', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('devise', 'character varying(3)', {
            notNull: true,
            default: lit('XAF'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 3 } },
          }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('solde', 'numeric(15,2)', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 15, scale: 2 } },
          }),
          col('statut', 'text', {
            notNull: true,
            default: lit('ACTIF'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('utilisateur_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'portefeuilles_statut_check_567b153d',
            "\"statut\" IN ('ACTIF', 'SUSPENDU', 'FERME')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'utilisateurs',
        columns: [
          col('date_creation', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('date_modification', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('date_verification_telephone', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('email', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('mot_de_passe', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('nom', 'character varying(150)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 150 } },
          }),
          col('photo', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('role', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('statut', 'text', {
            notNull: true,
            default: lit('ACTIF'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('telephone', 'character varying(30)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 30 } },
          }),
          col('telephone_verifie', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('uuid', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'utilisateurs_role_check_3cb37cfc',
            "\"role\" IN ('PARTICULIER', 'ENTREPRISE', 'COLLECTEUR', 'ADMINISTRATEUR')",
          ),
          checkExpression(
            'utilisateurs_statut_check_65d85a93',
            "\"statut\" IN ('ACTIF', 'SUSPENDU', 'INACTIF')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'entreprises',
        constraint: 'entreprises_utilisateur_id_key',
        columns: ['utilisateur_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'points_collecte',
        constraint: 'points_collecte_jeton_qr_key',
        columns: ['jeton_qr'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'portefeuilles',
        constraint: 'portefeuilles_utilisateur_id_key',
        columns: ['utilisateur_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'utilisateurs',
        constraint: 'utilisateurs_uuid_key',
        columns: ['uuid'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'utilisateurs',
        constraint: 'utilisateurs_telephone_key',
        columns: ['telephone'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'points_collecte',
        index: 'points_collecte_entreprise_id_idx_1d660c37',
        columns: ['entreprise_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'points_collecte',
        index: 'points_collecte_utilisateur_id_idx_afedb02c',
        columns: ['utilisateur_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'utilisateurs',
        index: 'utilisateurs_role_idx_2c1ddf83',
        columns: ['role'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'utilisateurs',
        index: 'utilisateurs_statut_idx_9bf78e02',
        columns: ['statut'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'entreprises',
        foreignKey: {
          name: 'entreprises_utilisateur_id_fkey',
          columns: ['utilisateur_id'],
          references: { schema: 'public', table: 'utilisateurs', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'points_collecte',
        foreignKey: {
          name: 'points_collecte_utilisateur_id_fkey',
          columns: ['utilisateur_id'],
          references: { schema: 'public', table: 'utilisateurs', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'points_collecte',
        foreignKey: {
          name: 'points_collecte_entreprise_id_fkey',
          columns: ['entreprise_id'],
          references: { schema: 'public', table: 'entreprises', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'portefeuilles',
        foreignKey: {
          name: 'portefeuilles_utilisateur_id_fkey',
          columns: ['utilisateur_id'],
          references: { schema: 'public', table: 'utilisateurs', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
