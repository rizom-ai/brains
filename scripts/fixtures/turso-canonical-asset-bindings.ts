// Integration adapter only: real actors and real entity SQL, not runtime wiring.
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createAssetRef, type AssetRef } from "@brains/assets";
import {
  createOwnedAssetPublication,
  type OwnedAssetPublication,
} from "@brains/entity-service";
import { WorkerBinaryPersistence } from "../../shared/db/src/turso-worker/binary-persistence";
import type {
  SqlWorkerDriver,
  WorkerTransaction,
} from "../../shared/db/src/turso-worker/client";
import type { PersistenceBudgetPool } from "../../shared/db/src/turso-worker/budget-pool";
import type { StageClaim } from "../../shared/db/src/turso-worker/binary-protocol";
import { uploadNetworkFixture } from "../../shared/db/test/fixtures/turso-thread/network-exercise";

async function withCleanup<T>(
  operation: () => Promise<T>,
  close: () => Promise<void>,
): Promise<T> {
  let value: T;
  try {
    value = await operation();
  } catch (error) {
    try {
      await close();
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        "Canonical asset operation and acknowledged cleanup failed",
        { cause: cleanup },
      );
    }
    throw error;
  }
  await close();
  return value;
}
const sidecar = (name: string): URL =>
  new URL(
    [
      "worker",
      "network-ingress-worker",
      "file-upload-process",
      "network-read-worker",
      "transfer-receiver",
    ].includes(name)
      ? `../../shared/db/src/turso-worker/${name}.ts`
      : `../../shared/db/test/fixtures/turso-thread/${name}.ts`,
    import.meta.url,
  );

export class CanonicalAssetBindings {
  private readonly observation = new AsyncLocalStorage<{
    afterBody?: ((transaction: WorkerTransaction) => Promise<void>) | undefined;
  }>();
  public readonly binary: WorkerBinaryPersistence;
  private readonly driver: SqlWorkerDriver;
  private readonly pool: PersistenceBudgetPool;
  public constructor(driver: SqlWorkerDriver, pool: PersistenceBudgetPool) {
    this.driver = driver;
    this.pool = pool;
    this.binary = new WorkerBinaryPersistence({
      driver,
      budget: pool,
      uploadBridgeUrl: sidecar("network-ingress-worker"),
      readBridgeUrl: sidecar("network-read-worker"),
    });
    const transaction = driver.transaction.bind(driver);
    driver.transaction = async (
      mode,
      claims = [],
    ): ReturnType<typeof transaction> => {
      const lease = await transaction(mode, claims);
      const afterBody = this.observation.getStore()?.afterBody;
      if (claims.length > 0 && afterBody) {
        const commit = lease.commit.bind(lease);
        lease.commit = async (): Promise<void> => {
          await afterBody(lease);
          await commit();
        };
      }
      return lease;
    };
    const close = this.binary.close.bind(this.binary);
    this.binary.close = async (): Promise<void> => {
      this.assertOwnerOpen();
      await close();
      this.assertOwnerOpen();
    };
  }

  public async withFile<T>(
    path: string,
    sizeBytes: number,
    digest: string,
    operation: (publication: OwnedAssetPublication) => Promise<T>,
    afterBody?: (transaction: WorkerTransaction) => Promise<void>,
  ): Promise<T> {
    const scope = await this.driver.openBinaryScope();
    return withCleanup(
      async () => {
        const stage = await scope.begin({
          reservationBytes: sizeBytes,
          expectedSize: sizeBytes,
          expectedDigest: digest,
        });
        const facts = await uploadNetworkFixture(
          this.driver,
          this.pool,
          stage,
          sizeBytes,
          {
            sourceFile: path,
            bunExecutable: process.execPath, // This source-only test runs under external Bun.
            bridgeUrl: sidecar("network-ingress-worker"),
            producerUrl: sidecar("file-upload-process"),
          },
        );
        const claim = await scope.reserve(stage);
        return withCleanup(
          () => this.withClaim(claim, facts, operation, afterBody),
          async () => {
            await this.driver.binary({ action: "releaseClaim", claim });
          },
        );
      },
      () => scope.close(),
    );
  }

  public withClaim<T>(
    claim: StageClaim,
    facts: { sha256: string; sizeBytes: number },
    operation: (publication: OwnedAssetPublication) => Promise<T>,
    afterBody?: (transaction: WorkerTransaction) => Promise<void>,
  ): Promise<T> {
    return this.observation.run({ afterBody }, () =>
      this.binary.bindings.withClaim(claim, facts, (publication) =>
        operation(createOwnedAssetPublication(publication)),
      ),
    );
  }

  public async publicationRows(
    id: string,
    context?: WorkerTransaction,
  ): Promise<{ entity: number; exportIntent: number; dirty: number }> {
    const text = `SELECT
      (SELECT count(*) FROM entities WHERE entityType='image' AND id=?) AS entity_count,
      (SELECT count(*) FROM entity_export_intents WHERE entity_type='image' AND entity_id=?) AS export_count,
      (SELECT count(*) FROM projection_dirty_inputs WHERE source_type='image' AND source_id=?) AS dirty_count`;
    const params = [id, id, id];
    const result = context
      ? await context.execute({ sql: text, args: params })
      : await this.driver.execute({ sql: text, args: params });
    const row = result.rows[0];
    return {
      entity: Number(row?.["entity_count"]),
      exportIntent: Number(row?.["export_count"]),
      dirty: Number(row?.["dirty_count"]),
    };
  }

  public async withCorruptRead<T>(
    operation: (ref: AssetRef) => Promise<T>,
  ): Promise<T> {
    const digest = "0".repeat(64);
    const ref = createAssetRef(digest);
    await this.driver.execute({
      sql: "INSERT INTO assets (digest, size_bytes, bytes, created) VALUES (?, 1, x'00', 0)",
      args: [digest],
    });
    return withCleanup(
      () => operation(ref),
      async () => {
        await this.driver.execute({
          sql: "DELETE FROM assets WHERE digest = ?",
          args: [digest],
        });
      },
    );
  }

  public assertOwnerOpen(): void {
    assert.equal(this.driver.closed, false);
  }

  public assertTransferIdle(): void {
    assert.equal(this.pool.stats().residentBytes, 0);
    assert.equal(this.pool.stats().scratchBytes, 0);
    assert.equal(this.pool.ingress.stats().slots, 0);
    assert.equal(this.pool.networkIngress.stats().slots, 0);
    assert.equal(this.pool.networkEgress.stats().slots, 0);
  }
}
