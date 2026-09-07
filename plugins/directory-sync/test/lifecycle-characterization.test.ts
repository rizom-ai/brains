import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createPluginHarness, expectSuccess } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import type { Plugin } from "@brains/plugins";
import { instantiate, SYNC_TOOL } from "./helpers/install";
import { initializeDirectorySync } from "../src/lib/directory-lifecycle";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return {
    promise,
    resolve: (value): void => settle?.(value),
  };
}

describe("directory-sync lifecycle characterization", () => {
  const paths: string[] = [];
  const plugins: Plugin[] = [];

  afterEach(async () => {
    for (const plugin of plugins.splice(0).reverse()) {
      await plugin.shutdown?.();
    }
    for (const path of paths.splice(0).reverse()) {
      if (existsSync(path)) rmSync(path, { recursive: true, force: true });
    }
  });

  function createPath(label: string): string {
    const path = join(
      tmpdir(),
      `directory-lifecycle-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    paths.push(path);
    return path;
  }

  it("waits for watcher startup during direct initialization", async () => {
    const syncPath = createPath("watcher-start");
    const watcherStartCalled = deferred<void>();
    const watcherStart = deferred<void>();

    const initialization = initializeDirectorySync(
      createSilentLogger("directory-lifecycle"),
      syncPath,
      true,
      (): Promise<void> => {
        watcherStartCalled.resolve();
        return watcherStart.promise;
      },
    );
    await watcherStartCalled.promise;

    let initializationSettled = false;
    void initialization.then(() => {
      initializationSettled = true;
    });
    await Promise.resolve();
    expect(initializationSettled).toBe(false);

    watcherStart.resolve();
    await initialization;
    expect(initializationSettled).toBe(true);
  });

  it("starts autoSync watching during ready and closes it during shutdown", async () => {
    const syncPath = createPath("ready");
    const harness = createPluginHarness({
      dataDir: syncPath,
    });
    const { plugin, state } = instantiate({
      syncPath,
      autoSync: true,
      initialSync: false,
    });
    plugins.push(plugin);

    await harness.installPlugin(plugin);
    const directorySync = state().directorySync;
    if (!directorySync) throw new Error("DirectorySync not initialized");

    expect((await directorySync.getStatus()).watching).toBe(false);
    await plugin.ready?.();
    expect((await directorySync.getStatus()).watching).toBe(true);

    await plugin.shutdown?.();
    expect((await directorySync.getStatus()).watching).toBe(false);
  });

  it("keeps installed tools bound to the active path after reconfiguration", async () => {
    const originalPath = createPath("original");
    const replacementPath = createPath("replacement");
    const harness = createPluginHarness({
      dataDir: originalPath,
    });
    const { plugin, state } = instantiate({
      syncPath: originalPath,
      autoSync: false,
      initialSync: false,
    });
    plugins.push(plugin);

    await harness.installPlugin(plugin);
    const originalService = state().directorySync;
    await state().configure({ syncPath: replacementPath });

    expect(state().directorySync).not.toBe(originalService);
    const result = await harness.executeTool(SYNC_TOOL, {
      action: "status",
    });
    expectSuccess(result);
    expect(result.data).toMatchObject({ syncPath: replacementPath });
  });

  it("keeps the old generation active when candidate initialization fails", async () => {
    const originalPath = createPath("rollback-original");
    const invalidPath = createPath("rollback-invalid");
    writeFileSync(invalidPath, "not a directory");
    const harness = createPluginHarness({
      dataDir: originalPath,
    });
    const { plugin, state } = instantiate({
      syncPath: originalPath,
      autoSync: true,
      initialSync: false,
    });
    plugins.push(plugin);

    await harness.installPlugin(plugin);
    await plugin.ready?.();
    const originalService = state().directorySync;
    if (!originalService) throw new Error("DirectorySync not initialized");
    try {
      await state().configure({ syncPath: invalidPath });
      throw new Error("Expected candidate initialization failure");
    } catch {
      // The candidate must fail without replacing the active generation.
    }

    expect(state().directorySync).toBe(originalService);
    expect((await originalService.getStatus()).watching).toBe(true);
    const result = await harness.executeTool(SYNC_TOOL, {
      action: "status",
    });
    expectSuccess(result);
    expect(result.data).toMatchObject({ syncPath: originalPath });
  });

  it("closes the old watcher before publishing the replacement", async () => {
    const originalPath = createPath("watcher-original");
    const replacementPath = createPath("watcher-replacement");
    const harness = createPluginHarness({
      dataDir: originalPath,
    });
    const { plugin, state } = instantiate({
      syncPath: originalPath,
      autoSync: true,
      initialSync: false,
    });
    plugins.push(plugin);

    await harness.installPlugin(plugin);
    await plugin.ready?.();
    const originalService = state().directorySync;
    if (!originalService) throw new Error("DirectorySync not initialized");
    expect((await originalService.getStatus()).watching).toBe(true);

    await state().configure({ syncPath: replacementPath });
    const replacementService = state().directorySync;
    if (!replacementService) throw new Error("Replacement not initialized");

    expect((await originalService.getStatus()).watching).toBe(false);
    expect((await replacementService.getStatus()).watching).toBe(true);
  });
});
