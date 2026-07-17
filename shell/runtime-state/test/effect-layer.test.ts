import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Context, Effect, Exit, Layer, Scope } from "@brains/utils/effect";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  RuntimeStateServiceTag,
  createRuntimeStateServiceLayer,
} from "../src/effect";
import { migrateRuntimeState } from "../src/migrate";
import { RuntimeStateService } from "../src/runtime-state-service";

const logger = createSilentLogger("runtime-state-effect-layer");
const stringSchema = z.string();

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

describe("runtime-state Effect layer", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "runtime-state-layer-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function createDatabaseUrl(name: string): Promise<string> {
    const url = `file:${join(tempDir, `${name}.db`)}`;
    await migrateRuntimeState({ url });
    return url;
  }

  it("constructs independent services and closes only its own scope", async () => {
    const firstUrl = await createDatabaseUrl("first");
    const secondUrl = await createDatabaseUrl("second");
    const firstScope = Effect.runSync(Scope.make());
    const secondScope = Effect.runSync(Scope.make());

    const firstContext = Effect.runSync(
      Layer.buildWithScope(
        createRuntimeStateServiceLayer({
          config: { url: firstUrl },
          logger,
        }),
        firstScope,
      ),
    );
    const secondContext = Effect.runSync(
      Layer.buildWithScope(
        createRuntimeStateServiceLayer({
          config: { url: secondUrl },
          logger,
        }),
        secondScope,
      ),
    );
    const first = Context.get(firstContext, RuntimeStateServiceTag);
    const second = Context.get(secondContext, RuntimeStateServiceTag);

    expect(first).not.toBe(second);
    await first.initialize();
    await second.initialize();
    const firstStore = first.scoped({
      namespace: "test",
      schema: stringSchema,
    });
    const secondStore = second.scoped({
      namespace: "test",
      schema: stringSchema,
    });
    await firstStore.set("key", "first");
    await secondStore.set("key", "second");

    closeScope(firstScope);
    await expectClientClosed(firstStore.get("key"));
    expect(await secondStore.get("key")).toBe("second");

    closeScope(secondScope);
  });

  it("owns an injected service and releases it exactly once", async () => {
    const url = await createDatabaseUrl("injected");
    const service = RuntimeStateService.createFresh({ url }, logger);
    await service.initialize();
    let closeCalls = 0;
    const closeService = service.close.bind(service);
    service.close = (): void => {
      closeCalls++;
      closeService();
    };

    const scope = Effect.runSync(Scope.make());
    const context = Effect.runSync(
      Layer.buildWithScope(
        createRuntimeStateServiceLayer({
          config: { url },
          logger,
          service,
        }),
        scope,
      ),
    );

    expect(Context.get(context, RuntimeStateServiceTag)).toBe(service);
    closeScope(scope);
    closeScope(scope);

    expect(closeCalls).toBe(1);
  });

  it("supports synchronous rollback before readiness starts", async () => {
    const url = await createDatabaseUrl("rollback");
    const service = RuntimeStateService.createFresh({ url }, logger);
    let closeCalls = 0;
    const closeService = service.close.bind(service);
    service.close = (): void => {
      closeCalls++;
      closeService();
    };
    const scope = Effect.runSync(Scope.make());

    Effect.runSync(
      Layer.buildWithScope(
        createRuntimeStateServiceLayer({
          config: { url },
          logger,
          service,
        }),
        scope,
      ),
    );
    closeScope(scope);

    await service.initialize();
    expect(closeCalls).toBe(1);
    const store = service.scoped({ namespace: "test", schema: stringSchema });
    await expectClientClosed(store.get("key"));
  });
});
