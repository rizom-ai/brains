import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Shell, type ShellDependencies } from "../src/shell";
import type { ShellConfigInput } from "../src/config";
import { ShellInitializer } from "../src/initialization/shellInitializer";
import { createSilentLogger } from "@brains/test-utils";
import { createTestDirectory } from "./helpers/test-db";
import type { Plugin, Daemon } from "@brains/plugins";
import {
  InterfacePlugin,
  PluginManager,
  SYSTEM_CHANNELS,
} from "@brains/plugins";
import { EntityRegistry } from "@brains/entity-service";
import {
  JobQueueWorker,
  JobQueueService,
  BatchJobManager,
  JobProgressMonitor,
} from "@brains/job-queue";
import { DataSourceRegistry } from "@brains/entity-service";
import { MessageBus } from "@brains/messaging-service";
import { z } from "@brains/utils";

async function resetAllSingletons(): Promise<void> {
  await Shell.resetInstance();
  ShellInitializer.resetInstance();
  PluginManager.resetInstance();
  EntityRegistry.resetInstance();
  DataSourceRegistry.resetInstance();
  JobQueueService.resetInstance();
  BatchJobManager.resetInstance();
  JobQueueWorker.resetInstance();
  JobProgressMonitor.resetInstance();
  MessageBus.resetInstance();
}

interface TestDir {
  dir: string;
  cleanup: () => Promise<void>;
}

function createTestConfig(dir: string): ShellConfigInput {
  return {
    plugins: [],
    database: { url: `file:${dir}/test.db` },
    jobQueueDatabase: { url: `file:${dir}/jobs.db` },
    conversationDatabase: { url: `file:${dir}/conv.db` },
    embeddingDatabase: { url: `file:${dir}/embeddings.db` },
    ai: {
      model: "claude-haiku-4-5",
      apiKey: "test-key",
    },
  };
}

describe("Shell register-only mode", () => {
  let testDir: TestDir;
  let shell: Shell;

  const deps: Partial<ShellDependencies> = {
    logger: createSilentLogger("test"),
    embeddingService: {
      dimensions: 1536,
      generateEmbedding: async () => ({
        embedding: new Float32Array(1536).fill(0.1),
        usage: { tokens: 10 },
      }),
      generateEmbeddings: async (texts: string[]) => ({
        embeddings: texts.map(() => new Float32Array(1536).fill(0.1)),
        usage: { tokens: texts.length * 10 },
      }),
    },
  };

  beforeEach(async () => {
    testDir = await createTestDirectory();
    await resetAllSingletons();
  });

  afterEach(async () => {
    await shell.shutdown();
    await resetAllSingletons();
    await testDir.cleanup();
  });

  it("should register tools without emitting plugins-registered signal", async () => {
    let pluginsRegisteredFired = false;

    const testPlugin: Plugin = {
      id: "test-plugin",
      version: "1.0.0",
      type: "service",
      description: "Test plugin",
      packageName: "@test/plugin",
      register: async (shellInstance) => {
        shellInstance
          .getMessageBus()
          .subscribe(SYSTEM_CHANNELS.pluginsRegistered, async () => {
            pluginsRegisteredFired = true;
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
    await shell.initialize({ mode: "register-only" });

    // Tools should be registered and discoverable
    const cliTools = shell.getMCPService().getCliTools();
    expect(cliTools.some((t) => t.tool.cli?.name === "test")).toBe(true);

    // Internal plugins-registered coordination signal should NOT have fired
    expect(pluginsRegisteredFired).toBe(false);
  });

  it("should not start background job worker in register-only mode", async () => {
    const config = createTestConfig(testDir.dir);
    shell = Shell.createFresh(config, deps);
    await shell.initialize({ mode: "register-only" });

    // System tools should be registered
    const tools = shell.getMCPService().listTools();
    expect(tools.length).toBeGreaterThan(0);

    // Shell should be marked as initialized
    expect(shell.isInitialized()).toBe(true);
  });

  it("should fail initialization when a required daemon cannot start", async () => {
    class RequiredDaemonInterface extends InterfacePlugin {
      constructor() {
        super(
          "required-daemon",
          { version: "0.1.0", name: "@test/required-daemon" },
          {},
          z.object({}),
        );
      }

      public override requiresDaemonStartup(): boolean {
        return true;
      }

      protected override createDaemon(): Daemon | undefined {
        return {
          start: async (): Promise<void> => {
            throw new Error("Port 8080 is already in use");
          },
          stop: async (): Promise<void> => {},
        };
      }
    }

    const config = createTestConfig(testDir.dir);
    config.plugins = [new RequiredDaemonInterface()];
    shell = Shell.createFresh(config, deps);

    expect(shell.initialize()).rejects.toThrow("Port 8080 is already in use");
    expect(shell.isInitialized()).toBe(false);
  });

  it("should not start daemons in register-only mode", async () => {
    let daemonStarted = false;

    // Real InterfacePlugin subclass — matches how webserver/mcp/a2a work
    class TestDaemonInterface extends InterfacePlugin {
      constructor() {
        super(
          "test-daemon",
          { version: "0.1.0", name: "@test/daemon" },
          {},
          z.object({}),
        );
      }

      protected override createDaemon(): Daemon | undefined {
        return {
          start: async (): Promise<void> => {
            daemonStarted = true;
          },
          stop: async (): Promise<void> => {},
        };
      }
    }

    const config = createTestConfig(testDir.dir);
    config.plugins = [new TestDaemonInterface()];
    shell = Shell.createFresh(config, deps);
    await shell.initialize({ mode: "register-only" });

    // Daemon should NOT have started
    expect(daemonStarted).toBe(false);
  });
});
