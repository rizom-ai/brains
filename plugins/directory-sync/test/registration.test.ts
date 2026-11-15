import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ENTITY_CHANNELS,
  directorySyncPathContract,
  directorySyncStatusContract,
} from "@brains/contracts";
import {
  SYSTEM_CHANNELS,
  studioWorkspaceRegisterContract,
  studioWorkspaceUnregisterContract,
  type Plugin,
  type PluginCapabilities,
} from "@brains/plugins";
import {
  baseEntitySchema,
  createMockShell,
  type MockShell,
} from "@brains/plugins/test";
import type { DirectorySyncConfigInput } from "../src/types";
import { createDirectorySyncPlugins } from "./directory-sync-plugins";
import { MockEntityAdapter } from "./fixtures";

const paths: string[] = [];
afterEach(() => {
  for (const path of paths.splice(0))
    rmSync(path, { recursive: true, force: true });
});

interface Installed {
  shell: MockShell;
  plugins: Plugin[];
  capabilities: PluginCapabilities[];
  handlers: string[];
  events: string[];
}

/** One brain process with a note type, a Studio and its own sync directory. */
async function installed(
  config: DirectorySyncConfigInput = {},
  options: { executionOnly?: boolean } = {},
): Promise<Installed> {
  const syncPath = mkdtempSync(join(tmpdir(), "directory-sync-pin-"));
  paths.push(syncPath);
  const shell = createMockShell({ dataDir: syncPath });
  shell
    .getEntityRegistry()
    .registerEntityType("note", baseEntitySchema, new MockEntityAdapter());
  const handlers: string[] = [];
  spyOn(shell.getJobQueueService(), "registerHandler").mockImplementation(
    (type, handler) => {
      handlers.push(
        `${type} ${JSON.stringify({
          executionTimeoutMs: handler.executionTimeoutMs,
          exclusive: handler.exclusive,
        })}`,
      );
    },
  );
  const events: string[] = [];
  const bus = shell.getMessageBus();
  bus.subscribe<{ id: string }, { workspaceUrl: string }>(
    studioWorkspaceRegisterContract.name,
    async (message) => {
      events.push(`workspace ${message.payload.id}`);
      return {
        success: true,
        data: { workspaceUrl: `/studio/workspaces/${message.payload.id}` },
      };
    },
  );
  bus.subscribe<{ workspaceId: string }>(
    studioWorkspaceUnregisterContract.name,
    async (message) => {
      events.push(`unregister ${message.payload.workspaceId}`);
      return { success: true };
    },
  );
  const plugins = createDirectorySyncPlugins({
    syncPath,
    autoSync: false,
    initialSync: false,
    ...config,
  });
  const capabilities: PluginCapabilities[] = [];
  for (const plugin of plugins) {
    capabilities.push(
      await plugin.register(
        shell,
        options.executionOnly ? { executionOnly: true } : undefined,
      ),
    );
  }
  return { shell, plugins, capabilities, handlers, events };
}

function handlerCount(shell: MockShell, channel: string): number {
  return shell.getMessageBus().getHandlerCount(channel);
}

/**
 * What directory-sync registers, pinned as its service class registered it:
 * its tools, its status template, its jobs, its sync health, its answers to
 * the sync path and status contracts, the entity changes that wake its
 * export, its initial sync, and its Studio workspace once the brain is
 * ready. Git is pinned through the broker's own tests.
 */
describe("the directory-sync package's registered surface", () => {
  it("is the directory-sync service, with its tools and no routes", async () => {
    const { plugins, capabilities } = await installed();
    expect(
      plugins.map(({ id, type, packageName, dependencies }) => [
        id,
        type,
        packageName,
        dependencies ?? [],
      ]),
    ).toEqual([["directory-sync", "service", "@brains/directory-sync", []]]);
    expect(
      capabilities
        .flatMap(({ tools }) => tools)
        .map(({ name, visibility }) => [name, visibility]),
    ).toEqual([["directory_sync", "admin"]]);
    expect(capabilities.flatMap(({ resources }) => resources)).toEqual([]);
    for (const plugin of plugins) {
      expect(plugin.getWebRoutes?.() ?? []).toEqual([]);
      expect(plugin.getApiRoutes?.() ?? []).toEqual([]);
    }
  });

  it("registers its status template and its jobs in every process", async () => {
    for (const executionOnly of [false, true]) {
      const { shell, handlers } = await installed({}, { executionOnly });
      expect([...shell.getTemplates().keys()]).toEqual([
        "directory-sync:status",
      ]);
      expect(handlers).toEqual([
        "directory-sync:directory-sync {}",
        "directory-sync:directory-export {}",
        "directory-sync:directory-import {}",
        "directory-sync:directory-delete {}",
        "directory-sync:directory-cleanup {}",
        "directory-sync:cover-image-convert {}",
        "directory-sync:inline-image-convert {}",
      ]);
    }
  });

  it("reports its sync health, answers its contracts and wakes on entity changes in the main process only", async () => {
    const main = await installed();
    expect(
      (await main.shell.getOperationalHealthRegistry().getChecks()).map(
        ({ name }) => name,
      ),
    ).toEqual(["directory-sync:git-progress"]);
    for (const contract of [
      directorySyncPathContract.name,
      directorySyncStatusContract.name,
    ])
      expect(handlerCount(main.shell, contract)).toBe(1);
    for (const channel of [
      ENTITY_CHANNELS.created,
      ENTITY_CHANNELS.updated,
      ENTITY_CHANNELS.deleted,
    ])
      expect(handlerCount(main.shell, channel)).toBe(1);

    const worker = await installed({}, { executionOnly: true });
    expect(
      await worker.shell.getOperationalHealthRegistry().getChecks(),
    ).toEqual([]);
    for (const channel of [
      directorySyncPathContract.name,
      directorySyncStatusContract.name,
      ENTITY_CHANNELS.created,
      ENTITY_CHANNELS.updated,
      ENTITY_CHANNELS.deleted,
    ])
      expect(handlerCount(worker.shell, channel)).toBe(0);
  });

  it("answers once every plugin has registered with whether its initial sync is pending, in the main process only", async () => {
    const without = await installed();
    const base = handlerCount(without.shell, SYSTEM_CHANNELS.pluginsRegistered);
    const main = await installed({ initialSync: true });
    expect(handlerCount(main.shell, SYSTEM_CHANNELS.pluginsRegistered)).toBe(
      base + 1,
    );
    // As the shell collects the answers, once.
    const answers = await main.shell.getMessageBus().collect({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
      sender: "shell",
    });
    expect(
      answers.flatMap((answer) =>
        "data" in answer && answer.data !== undefined ? [answer.data] : [],
      ),
    ).toContainEqual({ initialSyncPending: true });

    const worker = await installed(
      { initialSync: true },
      { executionOnly: true },
    );
    const workerBase = handlerCount(
      (await installed({}, { executionOnly: true })).shell,
      SYSTEM_CHANNELS.pluginsRegistered,
    );
    expect(handlerCount(worker.shell, SYSTEM_CHANNELS.pluginsRegistered)).toBe(
      workerBase,
    );
  });

  it("shows its Studio workspace once the brain is ready, and takes it off when it shuts down", async () => {
    const brain = await installed();
    brain.events.push("ready");
    for (const plugin of brain.plugins) await plugin.ready?.();
    for (const plugin of brain.plugins) await plugin.shutdown?.();
    expect(brain.events).toEqual([
      "ready",
      "workspace directory-sync:sync",
      "unregister directory-sync:sync",
    ]);
  });
});
