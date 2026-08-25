import { describe, expect, it, mock } from "bun:test";
import { createSilentLogger, createTestEntity } from "@brains/test-utils";
import { Effect } from "@brains/utils/effect";
import { TestClock, TestContext } from "@brains/utils/effect/test";
import {
  DurableEntityExportDispatcher,
  type DurableEntityExportDirectory,
  type DurableEntityExportEntityService,
} from "../src/lib/durable-entity-export-dispatcher";
import type { DurableEntityExportIntent } from "../src/lib/durable-entity-export";
import { DirectorySyncRuntime } from "../src/lib/directory-sync-runtime";

function yieldToFibers(): Effect.Effect<void> {
  return Effect.yieldNow().pipe(Effect.andThen(Effect.yieldNow()));
}

describe("DurableEntityExportDispatcher", () => {
  it("discovers an intent created without a process-local wakeup", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const runtime = new DirectorySyncRuntime({ clock });
        const entity = createTestEntity("note", {
          id: "worker-created-note",
          content: "Created outside the Git-owner process",
        });
        let pending: DurableEntityExportIntent[] = [];
        const writeEntity = mock(async () => {});
        const entityService: DurableEntityExportEntityService = {
          listPendingEntityExports: async () => [...pending],
          hasPendingEntityExports: async () => pending.length > 0,
          acknowledgeEntityExports: async ({ intents }) => {
            const revisions = new Set(intents.map((intent) => intent.revision));
            const before = pending.length;
            pending = pending.filter(
              (intent) => !revisions.has(intent.revision),
            );
            return before - pending.length;
          },
          getEntity: async ({ entityType, id }) =>
            entityType === entity.entityType && id === entity.id
              ? entity
              : null,
        };
        const directorySync: DurableEntityExportDirectory = {
          suppressWatchPaths: () => {},
          isPendingDelete: () => false,
          fileOps: {
            getEntityConvergencePaths: () => ["worker-created-note.md"],
            writeEntity,
            getEntityDeletePaths: () => ["worker-created-note.md"],
            deleteEntityFiles: async () => {},
          },
        };
        const dispatcher = new DurableEntityExportDispatcher({
          runtime,
          directorySync,
          entityService,
          logger: createSilentLogger("entity-export-dispatcher-test"),
          debounceMs: 100,
          reconciliationIntervalMs: 100,
        });
        yield* Effect.promise(() => dispatcher.start());

        pending = [
          {
            entityType: entity.entityType,
            entityId: entity.id,
            operation: "upsert",
            revision: "worker-revision",
            markedAt: 1,
          },
        ];

        yield* TestClock.adjust(99);
        yield* yieldToFibers();
        expect(writeEntity).not.toHaveBeenCalled();

        yield* TestClock.adjust(1);
        yield* yieldToFibers();
        expect(writeEntity).toHaveBeenCalledWith(entity);
        expect(pending).toEqual([]);

        yield* Effect.promise(() => runtime.close());
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });
});
