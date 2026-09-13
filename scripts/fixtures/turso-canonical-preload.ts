// Isolated integration-test binding, NOT a runtime factory or startup command.
// Bun's module substitution routes the actual canonical services to real worker
// databases. No service, SQL result, provider response or native SDK is stubbed.
import { afterAll, mock } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as database from "@brains/db";
import type { CreateSqliteDatabaseOptions, SqliteConnection } from "@brains/db";
import { TursoThreadProof } from "../../shared/db/test/fixtures/turso-thread/client";
import { ProofBudgetPool } from "../../shared/db/test/fixtures/turso-thread/budget-pool";
import { createProofDatabase } from "../../shared/db/test/fixtures/turso-thread/binary-transaction";
import { SqlWorkerClient } from "../../shared/db/src/turso-worker/sql-client";
import { CanonicalAssetBindings } from "./turso-canonical-asset-bindings";

// The existing canonical fixture leaves auth at its default relative path.
// Isolate that path rather than opening the developer's ./data/auth database.
const directory = await mkdtemp(join(tmpdir(), "turso-canonical-candidate-"));
await mkdir(join(directory, "auth"));
const authUrl = pathToFileURL(join(directory, "auth", "auth.db")).href;
console.error(
  `[canonical-worker-candidate] isolated auth fixture retained at ${directory}`,
);
const pool = new ProofBudgetPool();
const workers: {
  url: string;
  driver: TursoThreadProof;
  placement: Promise<void>;
  bindings: CanonicalAssetBindings;
}[] = [];

export function canonicalAssetBindings(url: string): CanonicalAssetBindings {
  const owner = workers.find(
    (worker) => worker.url === url && !worker.driver.closed,
  );
  if (!owner)
    throw new Error("No live canonical entity database owner for publication");
  return owner.bindings;
}
const workerUrl = new URL(
  "../../shared/db/test/fixtures/turso-thread/worker.ts",
  import.meta.url,
);
function createCandidateDatabase<T extends Record<string, unknown>>(
  options: CreateSqliteDatabaseOptions<T>,
): SqliteConnection<T> {
  const url = options.url === "file:data/auth/auth.db" ? authUrl : options.url;
  console.error(`[canonical-worker-candidate] opening ${url}`);
  const driver = new TursoThreadProof({
    url,
    workerUrl,
    budget: pool,
  });
  const placement = driver.initialize().then((value) => {
    assert.equal(value.pid, process.pid);
    assert(value.threadId > 0);
  });
  // The afterAll join observes this failure even if application startup fails first.
  void placement.catch(() => undefined);
  const bindings = new CanonicalAssetBindings(driver, pool);
  workers.push({ url, driver, placement, bindings });
  return {
    url,
    client: new SqlWorkerClient(driver),
    db: createProofDatabase(driver, options.schema, bindings),
    ...(Object.hasOwn(options.schema, "assets") && { binary: bindings.binary }),
  };
}
const exports = { ...database, createSqliteDatabase: createCandidateDatabase };
await mock.module("@brains/db", () => exports);
console.error(
  "[canonical-worker-candidate] test-only factory binding installed; runtime factory unchanged",
);

export async function joinCanonicalOwners(): Promise<void> {
  const errors: unknown[] = [];
  if (workers.length === 0)
    errors.push(
      new Error("Canonical test did not use the candidate database factory"),
    );
  for (const { driver, placement, url } of workers) {
    if (!driver.closed)
      errors.push(
        new Error(
          `Application did not request close for candidate database: ${url}`,
        ),
      );
    try {
      await placement;
    } catch (error) {
      errors.push(error);
    }
    try {
      await driver.close();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(
      errors,
      "Canonical worker candidate cleanup/placement failed",
      { cause: errors[0] },
    );
  assert.equal(pool.stats().residentBytes, 0);
  assert.equal(pool.stats().scratchBytes, 0);
  assert.equal(pool.ingress.stats().slots, 0);
  assert.equal(pool.networkIngress.stats().slots, 0);
  assert.equal(pool.networkEgress.stats().slots, 0);
  console.error(
    `[canonical-worker-candidate] ${workers.length} database workers joined; application close requests and placement checked`,
  );
}
afterAll(joinCanonicalOwners);
