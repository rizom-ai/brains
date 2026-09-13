// Integration adapter only: real actors and real entity SQL, not runtime wiring.
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { Worker } from "node:worker_threads";
import { ScopedUploads } from "../../shared/db/test/fixtures/turso-thread/scoped-uploads";
import type { AssetRecord } from "@brains/assets";
import {
  createOwnedAssetPublication,
  type OwnedAssetPublication,
} from "@brains/entity-service";
import type { BinaryPublication } from "@brains/db/binary-publication";
import { CanonicalBinaryRuntime } from "./turso-canonical-binary-runtime";
import type { TursoThreadProof } from "../../shared/db/test/fixtures/turso-thread/client";
import type { ProofBudgetPool } from "../../shared/db/test/fixtures/turso-thread/budget-pool";
import type { StageClaim } from "../../shared/db/test/fixtures/turso-thread/binary-protocol";
import type {
  ProofBindingContext,
  ProofDatabaseBindings,
} from "../../shared/db/test/fixtures/turso-thread/binary-transaction";
import { uploadNetworkFixture } from "../../shared/db/test/fixtures/turso-thread/network-exercise";
import { downloadNetworkFixture } from "../../shared/db/test/fixtures/turso-thread/network-read-exercise";

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
    `../../shared/db/test/fixtures/turso-thread/${name}.ts`,
    import.meta.url,
  );

export class CanonicalAssetBindings implements ProofDatabaseBindings {
  private readonly scope = new AsyncLocalStorage<{
    claim: StageClaim;
    attached: boolean;
    root?: object;
    afterBody?: ((context: ProofBindingContext) => Promise<void>) | undefined;
  }>();
  private readonly contexts = new WeakMap<object, ProofBindingContext>();
  public readonly binary: CanonicalBinaryRuntime;
  private readonly driver: TursoThreadProof;
  private readonly pool: ProofBudgetPool;
  public constructor(driver: TursoThreadProof, pool: ProofBudgetPool) {
    this.driver = driver;
    this.pool = pool;
    this.binary = new CanonicalBinaryRuntime(this);
  }

  public claims(): StageClaim[] {
    const scope = this.scope.getStore();
    if (!scope || scope.attached) return [];
    scope.attached = true; // Claim admission happens before native begin, once.
    return [scope.claim];
  }
  public async run<T>(
    context: ProofBindingContext,
    operation: () => Promise<T>,
  ): Promise<T> {
    this.contexts.set(context.db, context);
    const scope = this.scope.getStore();
    if (scope && !scope.root) scope.root = context.db;
    try {
      const value = await operation();
      if (scope?.root === context.db) await scope.afterBody?.(context);
      return value;
    } finally {
      this.contexts.delete(context.db);
    }
  }

  public async withFile<T>(
    path: string,
    sizeBytes: number,
    digest: string,
    operation: (publication: OwnedAssetPublication) => Promise<T>,
    afterBody?: (context: ProofBindingContext) => Promise<void>,
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
            producerUrl: sidecar("network-producer"),
          },
        );
        const claim = await scope.reserve(stage);
        return this.withClaim(claim, facts, operation, afterBody);
      },
      () => scope.close(),
    );
  }

  public createUploadBroker(): ScopedUploads {
    return new ScopedUploads(this.driver, () => {
      throw new Error("Canonical upload requires its admitted network bridge");
    });
  }

  public spawnUploadBridge(): Worker {
    return this.pool.networkIngress.spawn(
      () => new Worker(sidecar("network-ingress-worker")),
    );
  }

  public withClaim<T>(
    claim: StageClaim,
    facts: { sha256: string; sizeBytes: number },
    operation: (publication: OwnedAssetPublication) => Promise<T>,
    afterBody?: (context: ProofBindingContext) => Promise<void>,
  ): Promise<T> {
    return this.withBinaryClaim(
      claim,
      facts,
      (publication) => operation(createOwnedAssetPublication(publication)),
      afterBody,
    );
  }

  public withBinaryClaim<T>(
    claim: StageClaim,
    facts: { sha256: string; sizeBytes: number },
    operation: (publication: BinaryPublication) => Promise<T>,
    afterBody?: (context: ProofBindingContext) => Promise<void>,
  ): Promise<T> {
    const contextFor = (transaction: object): ProofBindingContext => {
      if (this.scope.getStore()?.claim !== claim)
        throw new Error("Publication has no matching native claim scope");
      const context = this.contexts.get(transaction);
      if (!context)
        throw new Error("Publication has no live native transaction");
      return context;
    };
    const publication: BinaryPublication = {
      facts: Object.freeze({ ...facts }),
      run: <U>(body: () => Promise<U>): Promise<U> =>
        this.scope.run({ claim, attached: false, afterBody }, body),
      executeBound: async (transaction, query, placeholder): Promise<void> => {
        await contextFor(transaction).executeBound(
          query,
          new Map([[placeholder, claim]]),
        );
      },
      verifyBlob: (transaction, plan) =>
        contextFor(transaction).verifyBlob(plan),
    };
    return operation(publication);
  }

  public async publicationRows(
    id: string,
    context?: ProofBindingContext,
  ): Promise<{ entity: number; exportIntent: number; dirty: number }> {
    const text = `SELECT
      (SELECT count(*) FROM entities WHERE entityType='image' AND id=?) AS entity_count,
      (SELECT count(*) FROM entity_export_intents WHERE entity_type='image' AND entity_id=?) AS export_count,
      (SELECT count(*) FROM projection_dirty_inputs WHERE source_type='image' AND source_id=?) AS dirty_count`;
    const params = [id, id, id];
    const result = context
      ? await context.executeBound(
          { toSQL: () => ({ sql: text, params }) },
          new Map(),
        )
      : await this.driver.execute({ sql: text, args: params });
    const row = result.rows[0];
    return {
      entity: Number(row?.["entity_count"]),
      exportIntent: Number(row?.["export_count"]),
      dirty: Number(row?.["dirty_count"]),
    };
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

  public async verifyDownload(record: AssetRecord): Promise<void> {
    const scope = await this.driver.openReadScope();
    await withCleanup(
      async () => {
        const stage = await scope.prepare({
          table: "assets",
          column: "bytes",
          key: [{ column: "digest", value: record.digest }],
          maxBytes: record.sizeBytes,
          expectedSize: record.sizeBytes,
        });
        const facts = await downloadNetworkFixture(
          this.driver,
          this.pool,
          stage,
          {
            bunExecutable: process.execPath,
            readBridgeUrl: sidecar("network-read-worker"),
            readConsumerUrl: sidecar("network-read-consumer"),
          },
          async () => {},
        );
        assert.deepEqual(facts, {
          sizeBytes: record.sizeBytes,
          sha256: record.digest,
        });
      },
      () => scope.close(),
    );
  }
}
