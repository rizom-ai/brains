// Stages an asset, signals through a marker file, then waits to be killed.
import { writeFileSync } from "node:fs";
import { ASSET_CHUNK_BYTES } from "@brains/assets";
import { createEntityDatabase } from "../../src/db";
import { SqliteAssetRepository } from "../../src/sqlite-asset-repository";

const [url, mode, markerArg] = process.argv.slice(2);
if (
  !url ||
  !markerArg ||
  (mode !== "between-chunks" && mode !== "after-stage")
) {
  throw new Error("usage: stage-asset-child <url> <mode> <marker>");
}

const marker: string = markerArg;
const { db } = createEntityDatabase({ url });
const repository = new SqliteAssetRepository(db);
const waitForKill = (): Promise<never> => new Promise<never>(() => undefined);

async function* source(): AsyncGenerator<Uint8Array> {
  yield new Uint8Array(ASSET_CHUNK_BYTES).fill(1);
  yield new Uint8Array(ASSET_CHUNK_BYTES).fill(2);
  // The second chunk is committed before its successor is requested.
  if (mode === "between-chunks") {
    writeFileSync(marker, "paused");
    await waitForKill();
  }
  yield new Uint8Array(ASSET_CHUNK_BYTES).fill(3);
}

await repository.stage(source());
writeFileSync(marker, "staged");
await waitForKill();
