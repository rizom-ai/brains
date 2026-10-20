import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createClient, type Client } from "@libsql/client";
import { ASSET_CHUNK_BYTES } from "@brains/assets";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { minimalTestAdapter, minimalTestSchema } from "./helpers/test-schemas";
import { createEntityDatabase, type EntityDB } from "../src/db";
import { SqliteAssetRepository } from "../src/sqlite-asset-repository";

const HOUR_MS = 60 * 60 * 1000;
type AssetTable = "asset_uploads" | "asset_chunks" | "assets";

describe("SQLite asset staging", () => {
  let ctx: EntityServiceTestContext;
  let client: Client;
  let db: EntityDB;
  let clock: number;
  let writes: number;
  let repository: SqliteAssetRepository;

  beforeEach(async () => {
    ctx = await setupEntityService([
      {
        name: "test",
        schema: minimalTestSchema,
        adapter: minimalTestAdapter,
        config: { embeddable: false, binaryStorage: "asset" },
      },
    ]);
    await ctx.entityService.initialize();
    client = createClient({ url: ctx.dbConfig.url });
    db = createEntityDatabase(ctx.dbConfig).db;
    clock = 0;
    writes = 0;
    repository = new SqliteAssetRepository(db, {
      now: (): number => clock,
      runWrite: <TResult>(write: () => Promise<TResult>): Promise<TResult> => {
        writes++;
        return write();
      },
    });
  });

  afterEach(async () => {
    client.close();
    await ctx.cleanup();
  });

  async function tableCount(table: AssetTable): Promise<number> {
    const result = await client.execute(
      `SELECT count(*) AS count FROM ${table}`,
    );
    return Number(result.rows[0]?.["count"] ?? 0);
  }

  async function uploadIds(): Promise<string[]> {
    const result = await client.execute(
      "SELECT upload_id FROM asset_uploads ORDER BY created",
    );
    return result.rows.map((row) => String(row["upload_id"]));
  }

  test("sweeps only unreferenced uploads past the age threshold, in batches", async () => {
    const published = await repository.stage(Buffer.from("published"));
    const upload = repository.claim(published);
    await db.transaction((transaction) =>
      repository.bindEntityContent(transaction, published.ref, upload),
    );
    clock = 1;
    await repository.stage(randomBytes(ASSET_CHUNK_BYTES * 10));
    const [publishedId = "", expiredId = ""] = await uploadIds();

    clock = HOUR_MS / 2;
    await repository.stage(Buffer.from("young orphan"));
    expect(await tableCount("asset_uploads")).toBe(3);

    clock = HOUR_MS + 2;
    writes = 0;
    expect(await repository.sweepOrphanUploads()).toBe(1);

    expect(writes).toBeGreaterThan(2);
    const remaining = await uploadIds();
    expect(remaining).toContain(publishedId);
    expect(remaining).not.toContain(expiredId);
    expect(remaining).toHaveLength(2);
    expect(await tableCount("asset_chunks")).toBe(2);
    expect(await repository.stat(published.ref)).not.toBeNull();
  });

  test("staging sweeps expired orphans before writing", async () => {
    await repository.stage(Buffer.from("abandoned"));
    clock = HOUR_MS + 1;

    await repository.stage(Buffer.from("fresh"));

    expect(await tableCount("asset_uploads")).toBe(1);
    expect(await tableCount("asset_chunks")).toBe(1);
  });

  test("release never deletes a published upload", async () => {
    const staged = await repository.stage(Buffer.from("kept"));
    const upload = repository.claim(staged);
    await db.transaction((transaction) =>
      repository.bindEntityContent(transaction, staged.ref, upload),
    );

    await repository.release(staged);
    clock = HOUR_MS * 24;
    await repository.sweepOrphanUploads();

    expect(await tableCount("asset_uploads")).toBe(1);
    expect(Buffer.from(await repository.read(staged.ref))).toEqual(
      Buffer.from("kept"),
    );
  });

  async function waitForMarker(path: string, deadline: number): Promise<void> {
    if (existsSync(path)) return;
    if (Date.now() > deadline) throw new Error("Child never reached marker");
    await Bun.sleep(10);
    return waitForMarker(path, deadline);
  }

  async function killStagingChild(
    mode: "between-chunks" | "after-stage",
  ): Promise<void> {
    const marker = `${fileURLToPath(ctx.dbConfig.url)}.${mode}`;
    const child = Bun.spawn(
      [
        process.execPath,
        fileURLToPath(
          new URL("./fixtures/stage-asset-child.ts", import.meta.url),
        ),
        ctx.dbConfig.url,
        mode,
        marker,
      ],
      { stdout: "ignore", stderr: "inherit" },
    );
    try {
      await waitForMarker(marker, Date.now() + 15_000);
    } finally {
      child.kill("SIGKILL");
      await child.exited;
    }
  }

  test("a process killed between chunks leaves only a sweepable orphan", async () => {
    await killStagingChild("between-chunks");

    expect(await tableCount("assets")).toBe(0);
    expect(await tableCount("asset_uploads")).toBe(1);
    expect(await tableCount("asset_chunks")).toBe(2);

    clock = Date.now() + HOUR_MS + 1;
    expect(await repository.sweepOrphanUploads()).toBe(1);
    expect(await tableCount("asset_uploads")).toBe(0);
    expect(await tableCount("asset_chunks")).toBe(0);
  });

  test("a process killed after staging but before publish leaves no reference", async () => {
    await killStagingChild("after-stage");

    expect(await tableCount("assets")).toBe(0);
    expect(await tableCount("asset_chunks")).toBe(3);

    clock = Date.now() + HOUR_MS + 1;
    expect(await repository.sweepOrphanUploads()).toBe(1);
    expect(await tableCount("asset_chunks")).toBe(0);
  });
});
