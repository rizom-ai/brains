import {
  createSqliteDatabase,
  type SqliteConnection,
  type SqliteDatabase,
} from "@brains/db";
import { runtimeStateRecords } from "../schema/runtime-state";
import type { RuntimeStateDbConfig } from "../types";

export type RuntimeStateDB = SqliteDatabase;

export function createRuntimeStateDatabase(
  config: RuntimeStateDbConfig,
): SqliteConnection {
  return createSqliteDatabase({
    url: config.url,
    schema: { runtimeStateRecords },
    authToken: config.authToken,
    authTokenEnv: "RUNTIME_STATE_DATABASE_AUTH_TOKEN",
  });
}
