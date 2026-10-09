import { createTestEntity } from "@brains/entity-service/test";
import { describe, expect, it, mock } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { Effect } from "@brains/utils/effect";
import { TestClock } from "@brains/utils/effect/test";
import {
  DurableEntityExportDispatcher,
  type DurableEntityExportDirectory,
  type DurableEntityExportEntityService,
} from "../src/lib/durable-entity-export-dispatcher";
import type { DurableEntityExportIntent } from "../src/lib/durable-entity-export";
import { DirectorySyncRuntime } from "../src/lib/directory-sync-runtime";

function yieldToFibers(): Effect.Effect<void> {
  return Effect.yieldNow.pipe(Effect.andThen(Effect.yieldNow));
}

describe("DurableEntityExportDispatcher", () => {
  it.each(["note", "grouping-definitions"])(
    "discovers %s without a local wakeup and exports raw source",
    async (entityType) => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const clock = yield* TestClock.testClockWith(Effect.succeed);
          const runtime = new DirectorySyncRuntime({ clock });
          const entity = createTestEntity(entityType, {
            id: entityType === "note" ? "worker-created-note" : entityType,
            content:
              entityType === "note"
                ? '---\nclients: ["![Literal](entity://image/reference)"]\n---\n\n![Body](entity://image/reference)'
                : '---\ngroupings:\n  clients:\n    label: Clients\n    types: [note]\n    multiple: false\n    values: ["![Literal](entity://image/reference)"]\n---\n',
          });
          const reads = {
            getEntity: mock(async () => ({
              ...entity,
              content: entity.content.replaceAll(
                "entity://image/reference",
                "data:image/png;base64,rendered-preview",
              ),
            })),
            getEntityRaw: mock(async () => entity),
          };
          let pending: DurableEntityExportIntent[] = [];
          const writeEntity = mock(async () => {});
          const entityService: DurableEntityExportEntityService = {
            ...reads,
            listPendingEntityExports: async () => [...pending],
            hasPendingEntityExports: async () => pending.length > 0,
            acknowledgeEntityExports: async ({ intents }) => {
              const revisions = new Set(
                intents.map((intent) => intent.revision),
              );
              const before = pending.length;
              pending = pending.filter(
                (intent) => !revisions.has(intent.revision),
              );
              return before - pending.length;
            },
          };
          const directorySync: DurableEntityExportDirectory = {
            suppressWatchPaths: () => {},
            isPendingDelete: () => false,
            fileOps: {
              getEntityConvergencePaths: () => [`${entity.id}.md`],
              writeEntity,
              getEntityDeletePaths: () => [`${entity.id}.md`],
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
          expect(reads.getEntity).not.toHaveBeenCalled();
          expect(reads.getEntityRaw).toHaveBeenCalledWith({
            entityType,
            id: entity.id,
            visibilityScope: "restricted",
          });
          expect(pending).toEqual([]);

          yield* Effect.promise(() => runtime.close());
        }).pipe(Effect.provide(TestClock.layer())),
      );
    },
  );
});
