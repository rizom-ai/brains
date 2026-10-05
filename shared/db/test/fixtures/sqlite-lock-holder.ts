import { createSqliteClient } from "../../src/sqlite";

const url = process.argv[2];
if (!url || !process.send)
  throw new Error("Missing lock-holder fixture configuration");

const release = new Promise<void>((resolve) => {
  process.on("message", (message: unknown) => {
    if (message === "release") resolve();
  });
});
const client = createSqliteClient({ url });
const transaction = await client.transaction("write");
try {
  await transaction.execute("INSERT INTO probe VALUES (1)");
  process.send("held");
  await release;
  await transaction.commit();
} finally {
  transaction.close();
  client.close();
  process.disconnect();
}
