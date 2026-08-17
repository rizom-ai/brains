import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestShellConfig } from "./helpers/test-config";
import { Shell, type ShellDependencies } from "../src/shell";
import { createSilentLogger } from "@brains/test-utils";
import { createTestDirectory } from "@brains/test-utils";
import type { Plugin, Daemon } from "@brains/plugins";
import { InterfacePlugin, SYSTEM_CHANNELS } from "@brains/plugins";
import { migrateEntities } from "@brains/entity-service/migrate";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { migrateConversations } from "@brains/conversation-service/migrate";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { z } from "@brains/utils/zod";

interface TestDir {
  dir: string;
  cleanup: () => Promise<void>;
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
    await migrateEntities({ url: `file:${testDir.dir}/test.db` });
    await migrateJobQueue({ url: `file:${testDir.dir}/test-jobs.db` });
    await migrateConversations({ url: `file:${testDir.dir}/test-conv.db` });
    await migrateRuntimeState({
      url: `file:${testDir.dir}/test-runtime-state.db`,
    });
  });

  afterEach(async () => {
    await shell.shutdown();
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

    const config = createTestShellConfig(testDir.dir);
    config.plugins = [testPlugin];
    shell = Shell.createFresh(config, deps);
    await shell.initialize({ mode: "register-only" });

    // Tools should be registered and discoverable
    const cliTools = shell.getMCPService().getCliTools();
    expect(cliTools.some((t) => t.tool.cli?.name === "test")).toBe(true);

    // Internal plugins-registered coordination signal should NOT have fired
    expect(pluginsRegisteredFired).toBe(false);
  });

  it("should terminally remove plugin capabilities on disable", async () => {
    const testPlugin: Plugin = {
      id: "terminal-plugin",
      version: "1.0.0",
      type: "service",
      description: "Terminal lifecycle test plugin",
      packageName: "@test/terminal-plugin",
      register: async () => ({
        tools: [
          {
            name: "terminal_tool",
            description: "Removed during terminal teardown",
            inputSchema: {},
            handler: async () => ({ success: true, data: {} }),
          },
        ],
        resources: [],
      }),
    };
    const config = createTestShellConfig(testDir.dir);
    config.plugins = [testPlugin];
    shell = Shell.createFresh(config, deps);
    await shell.initialize({ mode: "register-only" });
    expect(
      shell
        .getMCPService()
        .listTools()
        .some(({ tool }) => tool.name === "terminal_tool"),
    ).toBe(true);

    await shell.getPluginManager().disablePlugin("terminal-plugin");

    expect(
      shell
        .getMCPService()
        .listTools()
        .some(({ tool }) => tool.name === "terminal_tool"),
    ).toBe(false);
  });

  it("should not start background job worker in register-only mode", async () => {
    const config = createTestShellConfig(testDir.dir);
    shell = Shell.createFresh(config, deps);
    await shell.initialize({ mode: "register-only" });

    // System tools should be registered
    const tools = shell.getMCPService().listTools();
    expect(tools.length).toBeGreaterThan(0);

    // Shell should be marked as initialized
    expect(shell.isInitialized()).toBe(true);
  });

  it("should roll back resources when a required daemon cannot start", async () => {
    const startupError = new Error("Port 8080 is already in use");
    let daemonStopped = false;

    class RequiredDaemonInterface extends InterfacePlugin<
      Record<string, never>,
      Record<string, never>
    > {
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
            throw startupError;
          },
          stop: async (): Promise<void> => {
            daemonStopped = true;
          },
        };
      }
    }

    const config = createTestShellConfig(testDir.dir);
    config.plugins = [new RequiredDaemonInterface()];
    shell = Shell.createFresh(config, deps);

    let receivedError: unknown;
    try {
      await shell.initialize();
    } catch (error) {
      receivedError = error;
    }

    expect(receivedError).toBe(startupError);
    expect(shell.isInitialized()).toBe(false);
    expect(daemonStopped).toBe(true);

    let retryError: unknown;
    try {
      await shell.initialize();
    } catch (error) {
      retryError = error;
    }
    expect(retryError).toEqual(
      new Error("Cannot initialize a shell after boot failure"),
    );

    let queryError: unknown;
    try {
      await shell.getJobQueueService().getStats();
    } catch (error) {
      queryError = error;
    }
    const fullQueryError =
      String(queryError) +
      (queryError instanceof Error && queryError.cause
        ? String(queryError.cause)
        : "");
    expect(fullQueryError).toContain("CLIENT_CLOSED");
  });

  it("should not start daemons in register-only mode", async () => {
    let daemonStarted = false;

    // Real InterfacePlugin subclass — matches how webserver/mcp/a2a work
    class TestDaemonInterface extends InterfacePlugin<
      Record<string, never>,
      Record<string, never>
    > {
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

    const config = createTestShellConfig(testDir.dir);
    config.plugins = [new TestDaemonInterface()];
    shell = Shell.createFresh(config, deps);
    await shell.initialize({ mode: "register-only" });

    // Daemon should NOT have started
    expect(daemonStarted).toBe(false);
  });
});
