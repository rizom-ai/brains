import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  baseEntitySchema,
  createMockShell,
  createPluginHarness,
  expectSuccess,
} from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import { createDirectorySyncTools } from "../src/tools";
import {
  MockEntityAdapter,
  createMockDirectorySync,
  createMockGitSync,
} from "./fixtures";
import { hostFor, instantiate, SYNC_TOOL } from "./helpers/install";

const statusPayload = z.object({
  syncPath: z.string(),
  watching: z.boolean(),
  lastSync: z.string().optional(),
  git: z.unknown().optional(),
});
const syncPayload = z.object({
  gitPulled: z.boolean(),
  status: z.enum(["queued", "settled"]),
  batchId: z.string().optional(),
  importOperations: z.number().optional(),
  totalFiles: z.number().optional(),
  message: z.string(),
});

/**
 * The one tool directory-sync declares. Its shape is a declaration, read
 * off the definition; what it does runs through the runtime, which resolves
 * the caller and files the work on the queue.
 */
describe("the sync tool", () => {
  describe("as declared", () => {
    it("is one admin tool with external side effects", async () => {
      const host = await hostFor(createMockShell());
      const tools = createDirectorySyncTools({
        directorySync: createMockDirectorySync(),
        host,
      });

      expect(tools.map((tool) => tool.name)).toEqual(["sync"]);
      expect(tools[0]).toMatchObject({
        permission: "admin",
        sideEffects: "external",
      });
    });

    it("documents direct git sync and bare status routing when git is configured", async () => {
      const host = await hostFor(createMockShell());
      const [tool] = createDirectorySyncTools({
        directorySync: createMockDirectorySync(),
        host,
        gitSync: createMockGitSync(),
      });
      if (!tool) throw new Error("Expected the sync tool");

      expect(tool.description).toContain("'sync with git'");
      expect(tool.description).toContain("never ask for those fields");
      expect(tool.description).toContain("bare 'what is the status'");
      expect(tool.input.safeParse({ action: "history" }).success).toBe(true);
    });

    it("offers no history without git", async () => {
      const host = await hostFor(createMockShell());
      const [tool] = createDirectorySyncTools({
        directorySync: createMockDirectorySync(),
        host,
      });
      if (!tool) throw new Error("Expected the sync tool");

      expect(tool.description).not.toContain("history");
      expect(tool.input.safeParse({ action: "history" }).success).toBe(false);
      // No action at all is a sync.
      expect(tool.input.parse({})).toEqual({ action: "sync" });
    });
  });

  describe("through the runtime", () => {
    let syncPath: string;
    let harness: ReturnType<typeof createPluginHarness>;

    beforeEach(async () => {
      syncPath = mkdtempSync(join(tmpdir(), "directory-sync-tool-"));
      harness = createPluginHarness({ dataDir: syncPath });
      harness
        .getEntityRegistry()
        .registerEntityType("note", baseEntitySchema, new MockEntityAdapter());
      const { plugin } = instantiate({
        syncPath,
        autoSync: false,
        initialSync: false,
        // No cleanup pass, so an empty directory has nothing to queue.
        deleteOnFileRemoval: false,
      });
      await harness.installPlugin(plugin);
    });

    afterEach(async () => {
      await harness.reset();
      rmSync(syncPath, { recursive: true, force: true });
    });

    it("is named for its declaration", () => {
      expect(harness.getCapabilities().tools.map((tool) => tool.name)).toEqual([
        SYNC_TOOL,
      ]);
    });

    it("answers a status check with where the mirror is", async () => {
      const result = await harness.executeTool(SYNC_TOOL, { action: "status" });

      expectSuccess(result);
      expect(statusPayload.parse(result.data)).toMatchObject({
        syncPath,
        watching: false,
      });
      expect(result.data).not.toHaveProperty("git");
    });

    it("queues an import batch for the files it finds", async () => {
      mkdirSync(join(syncPath, "note"), { recursive: true });
      writeFileSync(join(syncPath, "note", "hello.md"), "# Hello\n");

      const result = await harness.executeTool(SYNC_TOOL, { action: "sync" });

      expectSuccess(result);
      const payload = syncPayload.parse(result.data);
      expect(payload).toMatchObject({
        gitPulled: false,
        status: "queued",
        importOperations: 1,
        totalFiles: 1,
      });
      const queued = await harness.getMockShell().jobs.getRecentJobs();
      expect(queued.map((job) => job.type)).toContain(
        "@brains/directory-sync:directory-sync:directory-import",
      );
      expect(
        queued.every((job) => job.metadata["rootJobId"] === payload.batchId),
      ).toBe(true);
    });

    it("settles at once when there is nothing to sync", async () => {
      const result = await harness.executeTool(SYNC_TOOL, {});

      expectSuccess(result);
      expect(syncPayload.parse(result.data)).toMatchObject({
        gitPulled: false,
        status: "settled",
        message: "No files to sync",
      });
    });
  });
});
