import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createPluginHarness, expectSuccess } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { DirectorySyncPlugin } from "../src/plugin";
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
  const plugins: DirectorySyncPlugin[] = [];

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

  it("currently returns from initialization before watcher startup settles", async () => {
    const syncPath = createPath("watcher-start");
    const watcherStart = deferred<void>();
    let watcherStartCalled = false;

    await initializeDirectorySync(
      createSilentLogger("directory-lifecycle"),
      syncPath,
      true,
      (): Promise<void> => {
        watcherStartCalled = true;
        return watcherStart.promise;
      },
    );

    expect(watcherStartCalled).toBe(true);
    let watcherSettled = false;
    void watcherStart.promise.then(() => {
      watcherSettled = true;
    });
    await Promise.resolve();
    expect(watcherSettled).toBe(false);

    watcherStart.resolve();
    await watcherStart.promise;
  });

  it("currently leaves autoSync unwatched after registration and ready", async () => {
    const syncPath = createPath("ready");
    const harness = createPluginHarness<DirectorySyncPlugin>({
      dataDir: syncPath,
    });
    const plugin = new DirectorySyncPlugin({
      syncPath,
      autoSync: true,
      initialSync: false,
    });
    plugins.push(plugin);

    await harness.installPlugin(plugin);
    const directorySync = plugin.getDirectorySync();
    if (!directorySync) throw new Error("DirectorySync not initialized");

    expect((await directorySync.getStatus()).watching).toBe(false);
    await plugin.ready();
    expect((await directorySync.getStatus()).watching).toBe(false);
  });

  it("currently leaves installed tools bound to the old path after reconfiguration", async () => {
    const originalPath = createPath("original");
    const replacementPath = createPath("replacement");
    const harness = createPluginHarness<DirectorySyncPlugin>({
      dataDir: originalPath,
    });
    const plugin = new DirectorySyncPlugin({
      syncPath: originalPath,
      autoSync: false,
      initialSync: false,
    });
    plugins.push(plugin);

    await harness.installPlugin(plugin);
    const originalService = plugin.getDirectorySync();
    await plugin.configure({ syncPath: replacementPath });

    expect(plugin.getDirectorySync()).not.toBe(originalService);
    const result = await harness.executeTool("directory-sync_status");
    expectSuccess(result);
    expect(result.data).toMatchObject({ syncPath: originalPath });
  });
});
