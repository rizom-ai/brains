import type {
  SQLiteColumn,
  SQLiteTableWithColumns,
} from "drizzle-orm/sqlite-core";

/**
 * Drizzle column annotation aliases for exported SQLite tables.
 *
 * `isolatedDeclarations` requires exported table constants to carry explicit
 * types, and drizzle's inferred column types are internal `SQLiteColumn`
 * config objects. Before this module, every DB-owning package hand-wrote the
 * same sixteen-key config literal per column kind; these aliases are that
 * literal written once, with every axis the schemas actually vary on exposed
 * as a parameter.
 *
 * Schema files keep short local aliases binding their table name (and any
 * fixed axes) so the table declarations below them stay readable.
 */

export type SqliteTextColumn<
  TTableName extends string,
  TName extends string,
  TNotNull extends boolean,
  THasDefault extends boolean = false,
  TPrimaryKey extends boolean = false,
  THasRuntimeDefault extends boolean = false,
  TData = string,
  TEnumValues extends [string, ...string[]] = [string, ...string[]],
> = SQLiteColumn<
  {
    name: TName;
    tableName: TTableName;
    dataType: "string";
    columnType: "SQLiteText";
    data: TData;
    driverParam: string;
    notNull: TNotNull;
    hasDefault: THasDefault;
    isPrimaryKey: TPrimaryKey;
    isAutoincrement: false;
    hasRuntimeDefault: THasRuntimeDefault;
    enumValues: TEnumValues;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  },
  Record<string, never>,
  { length: number | undefined }
>;

export type SqliteIntegerColumn<
  TTableName extends string,
  TName extends string,
  TNotNull extends boolean,
  THasDefault extends boolean = false,
  THasRuntimeDefault extends boolean = false,
  TPrimaryKey extends boolean = false,
  TAutoincrement extends boolean = false,
  TData = number,
> = SQLiteColumn<
  {
    name: TName;
    tableName: TTableName;
    dataType: "number";
    columnType: "SQLiteInteger";
    data: TData;
    driverParam: number;
    notNull: TNotNull;
    hasDefault: THasDefault;
    isPrimaryKey: TPrimaryKey;
    isAutoincrement: TAutoincrement;
    hasRuntimeDefault: THasRuntimeDefault;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  },
  Record<string, never>,
  Record<string, never>
>;

export type SqliteJsonColumn<
  TTableName extends string,
  TName extends string,
  TData,
  TNotNull extends boolean,
  TExtraConfig extends object = Record<string, never>,
  THasDefault extends boolean = false,
> = SQLiteColumn<
  {
    name: TName;
    tableName: TTableName;
    dataType: "json";
    columnType: "SQLiteTextJson";
    data: TData;
    driverParam: string;
    notNull: TNotNull;
    hasDefault: THasDefault;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  },
  Record<string, never>,
  TExtraConfig
>;

export type SqliteBooleanColumn<
  TTableName extends string,
  TName extends string,
  TNotNull extends boolean,
> = SQLiteColumn<
  {
    name: TName;
    tableName: TTableName;
    dataType: "boolean";
    columnType: "SQLiteBoolean";
    data: boolean;
    driverParam: number;
    notNull: TNotNull;
    hasDefault: false;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  },
  Record<string, never>,
  Record<string, never>
>;

export type SqliteTable<
  TName extends string,
  TColumns extends Record<string, SQLiteColumn>,
> = SQLiteTableWithColumns<{
  name: TName;
  schema: undefined;
  columns: TColumns;
  dialect: "sqlite";
}>;
