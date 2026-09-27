import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { z } from "@brains/utils/zod";
import type { createSqliteDatabase, SqliteConnection } from "../src/sqlite";
import { closeSqliteClient } from "../src/turso-client";

const factoryModule = z.object({
  createSqliteDatabase: z.custom<typeof createSqliteDatabase>(
    (value) => typeof value === "function",
  ),
});

test("independently bundled runtime factories share admission and actual-exit reclamation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "turso-runtime-bundles-"));
  const connections: SqliteConnection[] = [];
  const failures: unknown[] = [];
  const artifacts = {
    workerUrl: new URL("../src/turso-worker/worker.ts", import.meta.url),
    uploadBridgeUrl: new URL(
      "../src/turso-worker/network-ingress-worker.ts",
      import.meta.url,
    ),
    readBridgeUrl: new URL(
      "../src/turso-worker/network-read-worker.ts",
      import.meta.url,
    ),
  };
  const context = {
    signal: new AbortController().signal,
    connectionSignal: new AbortController().signal,
  };
  try {
    for (const name of ["cli", "public-library"]) {
      const output = join(directory, name);
      const build = await Bun.build({
        entrypoints: [new URL("../src/sqlite.ts", import.meta.url).pathname],
        outdir: output,
        target: "bun",
        external: ["@tursodatabase/database"],
      });
      if (!build.success)
        throw new AggregateError(build.logs, "Fixture bundle failed");
      const loaded: unknown = await import(
        pathToFileURL(join(output, "sqlite.js")).href
      );
      const module = factoryModule.parse(loaded);
      connections.push(
        module.createSqliteDatabase({
          url: "file::memory:",
          schema: { assets: {} },
          artifacts,
        }),
      );
    }
    const first = connections[0];
    const second = connections[1];
    assert.ok(first?.binary);
    assert.ok(second?.binary);
    await first.binary.offer(context, 100 * 1024 * 1024);
    await assert.rejects(second.binary.offer(context, 1), /capacity exceeded/);
    await closeSqliteClient(first.client);
    const reclaimed = await second.binary.offer(context, 100 * 1024 * 1024);
    await second.binary.cancel(context, reclaimed.ticket);
    expect(first.client.closed).toBe(true);
  } catch (error) {
    failures.push(error);
  } finally {
    const retired = await Promise.allSettled(
      connections.map((connection) => closeSqliteClient(connection.client)),
    );
    failures.push(
      ...retired.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      ),
    );
  }
  if (failures.length) {
    console.error(`Retained runtime bundle fixture: ${directory}`);
    throw new AggregateError(failures, "Bundled factory ownership failed", {
      cause: failures[0],
    });
  }
  await rm(directory, { recursive: true });
});
