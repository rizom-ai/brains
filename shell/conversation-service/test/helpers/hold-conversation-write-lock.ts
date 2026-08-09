import { createSqliteDatabase } from "@brains/db";
import { writeFile } from "node:fs/promises";

const url = process.env["LOCK_TEST_DATABASE_URL"];
const markerPath = process.env["LOCK_TEST_MARKER_PATH"];
if (!url || !markerPath) {
  throw new Error("Missing conversation lock test environment");
}

const connection = createSqliteDatabase({
  url,
  schema: {},
  engine: "turso",
});
const transaction = await connection.client.transaction("write");

try {
  const now = new Date().toISOString();
  await transaction.execute({
    sql: `INSERT INTO conversations (
      id, session_id, interface_type, channel_id,
      started, last_active, created, updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      "lock-holder",
      "lock-holder",
      "test",
      "lock-holder",
      now,
      now,
      now,
      now,
    ],
  });
  await writeFile(markerPath, "ready");
  await Bun.sleep(250);
  await transaction.commit();
} catch (error) {
  await transaction.rollback();
  throw error;
} finally {
  connection.client.close();
}
