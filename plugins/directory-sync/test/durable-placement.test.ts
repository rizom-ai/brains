import { describe, expect, test, spyOn } from "bun:test";
import { createTestEntity } from "@brains/entity-service/test";
import type { BaseEntity } from "@brains/plugins";
import {
  createMockServicePluginContext,
  createMockShell,
} from "@brains/plugins/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileOperations } from "../src/lib/file-operations";
import { DirectorySyncRuntime } from "../src/lib/directory-sync-runtime";
import { DirectorySyncOperationStatusService } from "../src/lib/directory-sync-operation-status";
import { DurableEntityExportDispatcher } from "../src/lib/durable-entity-export-dispatcher";
import type { DurableEntityExportIntent } from "../src/lib/durable-entity-export";

async function fixture(): Promise<{
  dispatcher: DurableEntityExportDispatcher;
  status: DirectorySyncOperationStatusService;
  files: FileOperations;
  queue: (id: string, operation?: "upsert" | "delete") => void;
  pending: () => DurableEntityExportIntent[];
  close: () => Promise<void>;
}> {
  const dir = await mkdtemp(join(tmpdir(), "durable-placement-"));
  const context = createMockServicePluginContext();
  const status = new DirectorySyncOperationStatusService(
    createMockShell().getRuntimeState(),
    context.jobs,
    context.logger,
    dir,
  );
  const runtime = new DirectorySyncRuntime();
  const files = new FileOperations(dir, {
    serializeEntity: (e): string => e.content,
    hasEntityType: (): boolean => true,
  });
  let pending: DurableEntityExportIntent[] = [];
  const dispatcher = new DurableEntityExportDispatcher({
    runtime,
    operationStatus: status,
    logger: context.logger,
    debounceMs: 60_000,
    directorySync: {
      fileOps: files,
      suppressWatchPaths: (): void => {},
      isPendingDelete: (): boolean => false,
    },
    entityService: {
      listPendingEntityExports: async (): Promise<
        DurableEntityExportIntent[]
      > => [...pending],
      hasPendingEntityExports: async (): Promise<boolean> => pending.length > 0,
      getEntity: async ({ id }): Promise<BaseEntity> =>
        createTestEntity("note", { id }),
      acknowledgeEntityExports: async ({ intents }): Promise<number> => {
        const revisions = new Set(intents.map((i) => i.revision));
        const before = pending.length;
        pending = pending.filter((i) => !revisions.has(i.revision));
        return before - pending.length;
      },
    },
  });
  return {
    dispatcher,
    status,
    files,
    queue: (id, operation = "upsert"): void => {
      pending.push({
        entityType: "note",
        entityId: id,
        operation,
        revision: `${operation}/${id}`,
        markedAt: 1,
      });
    },
    pending: (): DurableEntityExportIntent[] => pending,
    close: async (): Promise<void> => {
      await runtime.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

describe("durable placement refusals", () => {
  test("settles a refusal, exports the next valid intent and retains the issue across successful drains", async () => {
    const f = await fixture();
    try {
      f.queue("book:intro");
      f.queue("valid");
      await f.dispatcher.settleBeforeCleanup();
      expect(f.pending()).toEqual([]);
      expect((await f.status.getSnapshot()).issues).toEqual([
        expect.objectContaining({ kind: "placement", path: "note/book:intro" }),
      ]);
      f.queue("unrelated");
      await f.dispatcher.settleBeforeCleanup();
      expect((await f.status.getSnapshot()).issues).toHaveLength(1);
      f.queue("book:intro", "delete");
      await f.dispatcher.settleBeforeCleanup();
      expect(f.pending()).toEqual([]);
      expect((await f.status.getSnapshot()).issues).toEqual([]);
    } finally {
      await f.close();
    }
  });

  test("clears only the matching placement issue when an entity exports", async () => {
    const f = await fixture();
    try {
      await f.status.recordIssue({
        kind: "placement",
        path: "note/valid",
        message: "Historical refusal",
      });
      await f.status.recordIssue({
        kind: "placement",
        path: "note/other",
        message: "Other refusal",
      });
      f.queue("valid");
      await f.dispatcher.settleBeforeCleanup();
      expect((await f.status.getSnapshot()).issues.map((i) => i.path)).toEqual([
        "note/other",
      ]);
    } finally {
      await f.close();
    }
  });

  test("persists the issue before acknowledging and retries if status persistence fails", async () => {
    const f = await fixture();
    try {
      f.queue("book:intro");
      const error = new Error("status store unavailable");
      spyOn(f.status, "recordIssue").mockRejectedValueOnce(error);
      expect(
        await f.dispatcher.settleBeforeCleanup().catch((e: unknown) => e),
      ).toBe(error);
      expect(f.pending()).toHaveLength(1);
      await f.dispatcher.settleBeforeCleanup();
      expect(f.pending()).toEqual([]);
      expect((await f.status.getSnapshot()).issues).toEqual([
        expect.objectContaining({ kind: "placement" }),
      ]);
    } finally {
      await f.close();
    }
  });

  test("unrelated filesystem errors still fail the drain and retain the intent", async () => {
    const f = await fixture();
    try {
      const error = new Error("disk unavailable");
      spyOn(f.files, "writeEntity").mockRejectedValue(error);
      f.queue("valid");
      expect(
        await f.dispatcher.settleBeforeCleanup().catch((e: unknown) => e),
      ).toBe(error);
      expect(f.pending()).toHaveLength(1);
    } finally {
      await f.close();
    }
  });

  test("standing issues retain exact historical identities, not normalized filesystem keys", async () => {
    const f = await fixture();
    try {
      for (const id of [
        "bad/name",
        "bad\\name",
        ...Array.from({ length: 9 }, (_, i) => `book:part-${i}`),
      ])
        f.queue(id);
      await f.dispatcher.settleBeforeCleanup();
      expect((await f.status.getSnapshot()).issues).toHaveLength(11);
      f.queue("bad/name", "delete");
      await f.dispatcher.settleBeforeCleanup();
      const paths = (await f.status.getSnapshot()).issues.map((i) => i.path);
      expect(paths).toHaveLength(10);
      expect(paths).toContain("note/bad\\name");
      expect(paths).not.toContain("note/bad/name");
    } finally {
      await f.close();
    }
  });
});
