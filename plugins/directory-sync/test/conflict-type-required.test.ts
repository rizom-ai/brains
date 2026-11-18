import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baseEntitySchema, createPluginHarness } from "@brains/plugins/test";
import { getErrorMessage } from "@brains/utils/error";
import { MockEntityAdapter } from "./fixtures";
import {
  createDirectorySyncPlugin,
  type DirectorySyncPlugin,
} from "./directory-sync-plugins";

/** Why a promise was rejected, or an empty string when it was not. */
const rejection = (promise: Promise<unknown>): Promise<string> =>
  promise.then(
    () => "",
    (error: unknown) => getErrorMessage(error),
  );

describe("directory-sync and the conflict type", () => {
  let harness: ReturnType<typeof createPluginHarness<DirectorySyncPlugin>>;
  let syncPath: string;

  beforeEach(() => {
    syncPath = mkdtempSync(join(tmpdir(), "test-conflict-type-required-"));
    harness = createPluginHarness<DirectorySyncPlugin>({ dataDir: syncPath });
  });

  afterEach(async () => {
    await harness.reset();
    rmSync(syncPath, { recursive: true, force: true });
  });

  const install = async (): Promise<DirectorySyncPlugin> => {
    const plugin = createDirectorySyncPlugin({
      syncPath,
      autoSync: false,
      initialSync: false,
    });
    await harness.installPlugin(plugin);
    return plugin;
  };

  const finalized = async (plugin: DirectorySyncPlugin): Promise<void> => {
    if (!plugin.finalizeRegistration)
      throw new Error("The plugin has no registration to finalize");
    await plugin.finalizeRegistration();
  };

  it("refuses to start in a brain that cannot keep a losing edit", async () => {
    const plugin = await install();

    expect(await rejection(finalized(plugin))).toContain(
      'needs the "conflict" entity type',
    );
  });

  it("starts in a brain that has the conflict type", async () => {
    harness
      .getEntityRegistry()
      .registerEntityType(
        "conflict",
        baseEntitySchema,
        new MockEntityAdapter("conflict"),
      );
    const plugin = await install();

    expect(await rejection(finalized(plugin))).toBe("");
  });
});
