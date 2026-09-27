// Real default factories: no module substitution or candidate preload.
import { test, expect } from "bun:test";
import { closeSqliteClient, type SqliteConnection } from "@brains/db";
import { createEntityDatabase } from "../shell/entity-service/src/db";
import { createJobQueueDatabase } from "../shell/job-queue/src/db";
import { createRuntimeStateDatabase } from "../shell/runtime-state/src/db";
import { createConversationDatabase } from "../shell/conversation-service/src/database";
import { AuthRuntimeDatabase } from "../shell/auth-service/src/runtime-db";
import { SqlWorkerClient } from "../shared/db/src/turso-worker/sql-client";

test("all five runtime factories use owned Turso SQL workers without a candidate binding", async () => {
  const config = { url: "file::memory:" };
  const connections: Array<Pick<SqliteConnection, "client" | "binary">> = [];
  const failures: unknown[] = [];
  const auth = new AuthRuntimeDatabase(config);
  try {
    for (const create of [
      createEntityDatabase,
      createJobQueueDatabase,
      createRuntimeStateDatabase,
      createConversationDatabase,
    ])
      connections.push(create(config));
    await auth.start();
    for (const client of [
      ...connections.map((connection) => connection.client),
      auth.client,
    ]) {
      expect(client).toBeInstanceOf(SqlWorkerClient);
      const version = await client.execute("SELECT turso_version() AS version");
      expect(typeof version.rows[0]?.["version"]).toBe("string");
    }
    expect(connections[0]?.binary).toBeDefined();
    for (const connection of connections.slice(1))
      expect(connection.binary).toBeUndefined();
  } catch (error) {
    failures.push(error);
  } finally {
    const results = await Promise.allSettled([
      auth.stop(),
      ...connections.map((connection) => closeSqliteClient(connection.client)),
    ]);
    failures.push(
      ...results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      ),
    );
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      "Runtime factory execution or retirement failed",
      { cause: failures[0] },
    );
  for (const connection of connections)
    expect(connection.client.closed).toBe(true);
});
