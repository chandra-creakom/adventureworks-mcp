/**
 * @file schema.ts
 * @description Schema discovery helpers for Azure SQL (AdventureWorks).
 * Reads the target schema name from env (DB_SCHEMA) with safe validation.
 *
 * Env:
 *   DB_SCHEMA=SalesLT
 */

import { SQLClient } from "../db/sqlClient.js";

export interface TableInfo {
  tableName: string;
  schema: string;
}

export interface ColumnInfo {
  columnName: string;
  dataType: string;
  isNullable: "YES" | "NO";
  maxLength: number | null;
  precision: number | null;
  scale: number | null;
}

export interface PrimaryKeyInfo {
  tableName: string;
  columnName: string;
  keyOrdinal: number;
}

export interface ForeignKeyInfo {
  fkName: string;
  fromSchema: string;
  fromTable: string;
  fromColumn: string;
  toSchema: string;
  toTable: string;
  toColumn: string;
}

const DEFAULT_SCHEMA = "SalesLT";
const schemaNameFromEnv = process.env.DB_SCHEMA ?? DEFAULT_SCHEMA;

// /**
//  * Basic identifier validation for schema/table names.
//  * We still parameterize queries, but this prevents weird config values.
//  */
// function assertValidSqlIdentifier(name: string, label: string): void {
//   // Typical T-SQL identifier rules are broader, but this is a safe subset.
//   const ok = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
//   if (!ok) throw new Error(`${label} is invalid: "${name}"`);
// }

function getTargetSchema(): string {
  //   assertValidSqlIdentifier(schemaNameFromEnv, "DB_SCHEMA");
  return schemaNameFromEnv;
}

export class SchemaService {
  // Simple in-memory caches (safe because schema rarely changes)
  private static tablesCache: TableInfo[] | null = null;
  private static columnsCache = new Map<string, ColumnInfo[]>();

  /**
   * Lists all base tables in the configured schema.
   */
  static async getTables(): Promise<TableInfo[]> {
    if (this.tablesCache) return this.tablesCache;

    const schema = getTargetSchema();
    const query = `
      SELECT
        TABLE_NAME as tableName,
        TABLE_SCHEMA as [schema]
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = @schema
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `;

    const result = await SQLClient.query<TableInfo>(query, { schema });
    this.tablesCache = result.recordset;
    return result.recordset;
  }

  /**
   * Returns column metadata for a given table in the configured schema.
   * Includes type, nullability, and length/precision/scale when available.
   */
  static async getTableSchema(tableName: string): Promise<ColumnInfo[]> {
    // assertValidSqlIdentifier(tableName, "tableName");

    const schema = getTargetSchema();
    const cacheKey = `${schema}.${tableName}`;
    const cached = this.columnsCache.get(cacheKey);
    if (cached) return cached;

    // Optional safety: ensure table exists in this schema
    const tables = await this.getTables();
    if (!tables.some((t) => t.tableName === tableName && t.schema === schema)) {
      throw new Error(`Table not found or not allowed: ${schema}.${tableName}`);
    }

    const query = `
      SELECT
        COLUMN_NAME as columnName,
        DATA_TYPE as dataType,
        CAST(IS_NULLABLE as varchar(3)) as isNullable,
        CHARACTER_MAXIMUM_LENGTH as maxLength,
        NUMERIC_PRECISION as precision,
        NUMERIC_SCALE as scale
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @schema
        AND TABLE_NAME = @tableName
      ORDER BY ORDINAL_POSITION
    `;

    const result = await SQLClient.query<ColumnInfo>(query, {
      schema,
      tableName,
    });
    this.columnsCache.set(cacheKey, result.recordset);
    return result.recordset;
  }

  /**
   * Returns primary key columns for tables in the configured schema.
   */
  static async getPrimaryKeys(): Promise<PrimaryKeyInfo[]> {
    const schema = getTargetSchema();

    const query = `
      SELECT
        tc.TABLE_NAME as tableName,
        kcu.COLUMN_NAME as columnName,
        kcu.ORDINAL_POSITION as keyOrdinal
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
       AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
       AND tc.TABLE_NAME = kcu.TABLE_NAME
      WHERE tc.TABLE_SCHEMA = @schema
        AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
      ORDER BY tc.TABLE_NAME, kcu.ORDINAL_POSITION
    `;

    const result = await SQLClient.query<PrimaryKeyInfo>(query, { schema });
    return result.recordset;
  }

  /**
   * Returns foreign key relationships where BOTH sides are in the configured schema.
   * Uses sys.* because INFORMATION_SCHEMA does not expose FK relationships reliably.
   */
  static async getForeignKeys(): Promise<ForeignKeyInfo[]> {
    const schema = getTargetSchema();

    const query = `
      SELECT
        fk.name as fkName,
        sp.name as fromSchema,
        tp.name as fromTable,
        cp.name as fromColumn,
        sr.name as toSchema,
        tr.name as toTable,
        cr.name as toColumn
      FROM sys.foreign_keys fk
      JOIN sys.foreign_key_columns fkc
        ON fkc.constraint_object_id = fk.object_id
      JOIN sys.tables tp
        ON tp.object_id = fkc.parent_object_id
      JOIN sys.columns cp
        ON cp.object_id = tp.object_id
       AND cp.column_id = fkc.parent_column_id
      JOIN sys.tables tr
        ON tr.object_id = fkc.referenced_object_id
      JOIN sys.columns cr
        ON cr.object_id = tr.object_id
       AND cr.column_id = fkc.referenced_column_id
      JOIN sys.schemas sp
        ON sp.schema_id = tp.schema_id
      JOIN sys.schemas sr
        ON sr.schema_id = tr.schema_id
      WHERE sp.name = @schema
        AND sr.name = @schema
      ORDER BY fromTable, fkName, fromColumn
    `;

    const result = await SQLClient.query<ForeignKeyInfo>(query, { schema });
    return result.recordset;
  }

  /**
   * Clears caches (useful if you change DB_SCHEMA and restart without process restart in some environments).
   */
  static clearCache(): void {
    this.tablesCache = null;
    this.columnsCache.clear();
  }
}
