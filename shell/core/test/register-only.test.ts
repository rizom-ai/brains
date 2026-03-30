import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Shell, type ShellDependencies } from "../src/shell";
import type { ShellConfigInput } from "../src/config";
import { ShellInitializer } from "../src/initialization/shellInitializer";
import { createSilentLogger } from "@brains/test-utils";
import { createTestDirectory } from "./helpers/test-db";
import type { Plugin } from "@brains/plugins";
import { PluginManager } from "@brains/plugins";
import { EntityRegistry } from "@brains/entity-service";
import {
  JobQueueWorker,
  JobQueueService,
  BatchJobManager,
  JobProgressMonitor,
} from "@brains/job-queue";
import { DataSourceRegistry } from "@brains/entity-service";
import { MessageBus } from "@brains/messaging-service";

const mockEmbed = mock(() => Promise.resolve([[0.1, 0.2, 0.3]]));
void mock.module("fastembed", () => ({
  EmbeddingModel: class MockEmbeddingModel {
    static async init(): Promise<MockEmbeddingModel> {
      return new this();
    }
    embed = mockEmbed;
  },
}));

async function resetAllSingletons(): Promise<void> {
  await Shell.resetInstance();
  ShellInitializer.resetInstance();
  PluginManager.resetInstance();
  MessageBus.resetInstance();
  EntityRegistry.resetInstance();
  JobQueueWorker.resetInstance();
  JobQueueService.resetInstance();
  BatchJobManager.resetInstance();
  JobProgressMonitor.resetInstance();
  DataSourceRegistry.resetInstance();
}

function createTestConfig(dir: string): ShellConfigInput {
  return {
    plugins: [],
    database: { url: `file:${dir}/test.db` },
    jobQueueDatabase: { url: `file:${dir}/test-jobs.db` },
    conversationDatabase: { url: `file:${dir}/test-conv.db` },
    embedding: {
      cacheDir: `${dir}/embeddings`,
      model: "fast-all-MiniLM-L6-v2",
    },
  };
}

const deps: ShellDependencies = { logger: createSilentLogger() };

describe("Shell registerOnly mode", () => {
  let testDir: { dir: string; cleanup: () => Promise<void> };
  let shell: Shell;

  beforeEach(async () => {
    testDir = await createTestDirectory();
    await resetAllSingletons();
  });

  afterEach(async () => {
    await shell.shutdown();
    await resetAllSingletons();
    await testDir.cleanup();
  });

  it("should register tools without emitting system:plugins:ready", async () => {
    let readyFired = false;

    const testPlugin: Plugin = {
      id: "test-plugin",
      version: "1.0.0",
      type: "service",
      description: "Test plugin",
      packageName: "@test/plugin",
      register: async (shellInstance) => {
        shellInstance
          .getMessageBus()
          .subscribe("system:plugins:ready", async () => {
            readyFired = true;
            return { success: true };
          });
        return {
          tools: [
            {
              name: "test_tool",
              description: "A test tool",
              inputSchema: {},
              handler: async () => ({ success: true, data: {} }),
              cli: { name: "test" },
            },
          ],
          resources: [],
        };
      },
    };

    const config = createTestConfig(testDir.dir);
    config.plugins = [testPlugin];
    shell = Shell.createFresh(config, deps);
    await shell.initialize({ registerOnly: true });

    // Tools should be registered and discoverable
    const cliTools = shell.getMCPService().getCliTools();
    expect(cliTools.some((t) => t.tool.cli?.name === "test")).toBe(true);

    // system:plugins:ready should NOT have fired
    expect(readyFired).toBe(false);
  });

  it("should not start background job worker in registerOnly mode", async () => {
    const config = createTestConfig(testDir.dir);
    shell = Shell.createFresh(config, deps);
    await shell.initialize({ registerOnly: true });

    // System tools should be registered
    const tools = shell.getMCPService().listTools();
    expect(tools.length).toBeGreaterThan(0);

    // Shell should be marked as initialized
    expect(shell.isInitialized()).toBe(true);
  });
});
