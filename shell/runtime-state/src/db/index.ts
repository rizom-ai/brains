import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { runtimeStateRecords } from "../schema/runtime-state";
import type { RuntimeStateDbConfig } from "../types";

export type RuntimeStateDB = LibSQLDatabase<Record<string, unknown>>;

export function createRuntimeStateDatabase(config: RuntimeStateDbConfig): {
  db: RuntimeStateDB;
  client: Client;
  url: string;
} {
  const url = config.url;
  const authToken =
    config.authToken ?? process.env["RUNTIME_STATE_DATABASE_AUTH_TOKEN"];

  const client = authToken
    ? createClient({ url, authToken })
    : createClient({ url });

  const db = drizzle(client, { schema: { runtimeStateRecords } });
  return { db, client, url };
}

export async function enableRuntimeStateWALMode(
  client: Client,
  url: string,
): Promise<void> {
  if (url.startsWith("file:")) {
    await client.execute("PRAGMA journal_mode = WAL");
    await client.execute("PRAGMA busy_timeout = 5000");
  }
}
