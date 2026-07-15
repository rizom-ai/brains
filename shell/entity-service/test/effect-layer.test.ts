import { afterEach, describe, expect, it } from "bun:test";
import { Context, Effect, Exit, Layer, Scope } from "@brains/utils/effect";
import {
  createMockJobQueueService,
  createSilentLogger,
} from "@brains/test-utils";
import {
  EntityServiceTag,
  createEntityServiceLayer,
  type EntityServiceLayerOptions,
} from "../src/effect";
import { EntityRegistry } from "../src/entityRegistry";
import { EntityService } from "../src/entityService";
import { mockEmbeddingService } from "./helpers/mock-services";
import { createTestEntityDatabase } from "./helpers/test-entity-db";

const logger = createSilentLogger("entity-effect-layer");

type TestDatabase = Awaited<ReturnType<typeof createTestEntityDatabase>>;

function closeScope(scope: Scope.CloseableScope): void {
  Effect.runSync(Scope.close(scope, Exit.void));
}

async function expectClientClosed(promise: Promise<unknown>): Promise<void> {
  let closeError: unknown;
  try {
    await promise;
  } catch (error) {
    closeError = error;
  }
  const errorText =
    String(closeError) +
    (closeError instanceof Error && closeError.cause
      ? String(closeError.cause)
      : "");
  expect(errorText).toContain("CLIENT_CLOSED");
}

function createLayerOptions(database: TestDatabase): EntityServiceLayerOptions {
  return {
    embeddingService: mockEmbeddingService,
    entityRegistry: EntityRegistry.createFresh(logger),
    logger,
    jobQueueService: createMockJobQueueService(),
    dbConfig: database.config,
    embeddingDbConfig: database.embeddingConfig,
  };
}

describe("entity-service Effect layer", () => {
  const scopes: Scope.CloseableScope[] = [];
  const databaseCleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const scope of scopes.splice(0).reverse()) closeScope(scope);
    for (const cleanup of databaseCleanups.splice(0).reverse()) await cleanup();
  });

  async function createDatabase(): Promise<TestDatabase> {
    const database = await createTestEntityDatabase();
    databaseCleanups.push(database.cleanup);
    return database;
  }

  function createScope(): Scope.CloseableScope {
    const scope = Effect.runSync(Scope.make());
    scopes.push(scope);
    return scope;
  }

  it("constructs independent services and closes both owned databases", async () => {
    const firstDatabase = await createDatabase();
    const secondDatabase = await createDatabase();
    const firstScope = createScope();
    const secondScope = createScope();

    const firstContext = Effect.runSync(
      Layer.buildWithScope(
        createEntityServiceLayer(createLayerOptions(firstDatabase)),
        firstScope,
      ),
    );
    const secondContext = Effect.runSync(
      Layer.buildWithScope(
        createEntityServiceLayer(createLayerOptions(secondDatabase)),
        secondScope,
      ),
    );
    const first = Context.get(firstContext, EntityServiceTag);
    const second = Context.get(secondContext, EntityServiceTag);

    expect(first).not.toBe(second);
    await first.initialize();
    await second.initialize();

    closeScope(firstScope);
    await expectClientClosed(first.listEntities({ entityType: "note" }));
    await expectClientClosed(first.countEmbeddings());
    expect(await second.listEntities({ entityType: "note" })).toEqual([]);
    expect(await second.countEmbeddings()).toBe(0);

    closeScope(secondScope);
  });

  it("owns an injected closeable service and releases it exactly once", async () => {
    const database = await createDatabase();
    const options = createLayerOptions(database);
    const service = EntityService.createFresh(options);
    await service.initialize();
    let closeCalls = 0;
    const closeService = service.close.bind(service);
    service.close = (): void => {
      closeCalls++;
      closeService();
    };

    const scope = createScope();
    const context = Effect.runSync(
      Layer.buildWithScope(
        createEntityServiceLayer({ ...options, service }),
        scope,
      ),
    );

    expect(Context.get(context, EntityServiceTag)).toBe(service);
    closeScope(scope);
    closeScope(scope);

    expect(closeCalls).toBe(1);
    await expectClientClosed(service.listEntities({ entityType: "note" }));
    await expectClientClosed(service.countEmbeddings());
  });

  it("supports synchronous rollback before database readiness", async () => {
    const database = await createDatabase();
    const scope = createScope();
    const context = Effect.runSync(
      Layer.buildWithScope(
        createEntityServiceLayer(createLayerOptions(database)),
        scope,
      ),
    );
    const service = Context.get(context, EntityServiceTag);

    closeScope(scope);
    try {
      await service.initialize();
    } catch {
      // Closing the scope intentionally interrupts database initialization.
    }

    await expectClientClosed(service.listEntities({ entityType: "note" }));
    await expectClientClosed(service.countEmbeddings());
  });
});
