import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { waitUntil } from "@brains/test-utils";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { instantiate } from "./helpers/install";

// A start, an upgrade included, may bring new renderer code that the input
// fingerprint cannot see; the renderer identity is fresh per process so a
// requested build renders again. Nothing requested one at start, so a
// deployed brain kept serving the site its previous version built. Now every
// environment that already has an output is built again once the brain's
// startup content has settled — never before a queued startup import is in —
// and an environment never built stays untouched.
describe("the site builder at start", () => {
  let dir: string;
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "site-builder-start-"));
    harness = createPluginHarness({
      dataDir: join(dir, "data"),
    });
  });

  afterEach(async () => {
    await harness.reset();
    await rm(dir, { recursive: true, force: true });
  });

  const isSiteBuild = (data: unknown): data is { environment: string } =>
    typeof data === "object" &&
    data !== null &&
    "environment" in data &&
    typeof data.environment === "string";

  const start = async (
    expected: number,
    options: { settle: boolean } = { settle: true },
  ): Promise<string[]> => {
    const plugin = instantiate({
      productionOutputDir: join(dir, "site-production"),
      previewOutputDir: join(dir, "site-preview"),
      autoRebuild: false,
    });
    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    await plugin.ready?.();
    if (options.settle) {
      await harness.sendMessage(SYSTEM_CHANNELS.startupContentSettled, {});
    }
    const queue = harness.getMockShell().getJobQueueService();
    const environments = async (): Promise<string[]> =>
      (await queue.getActiveJobs())
        .filter((job) => job.type.endsWith(":site-build"))
        .map((job) =>
          typeof job.data === "string" ? JSON.parse(job.data) : job.data,
        )
        .filter(isSiteBuild)
        .map((data) => data.environment)
        .sort();
    // The request is debounced: give it its leading edge.
    await waitUntil(
      async () => (await environments()).length >= expected,
      "the start to request its builds",
      { timeoutMs: 2_000 },
    );
    return environments();
  };

  it("requests nothing when no environment has been built yet", async () => {
    expect(await start(0)).toEqual([]);
  });

  it("builds the production site again when one exists", async () => {
    await mkdir(join(dir, "site-production"), { recursive: true });
    await writeFile(
      join(dir, "site-production", "index.html"),
      "<html></html>",
    );
    expect(await start(1)).toEqual(["production"]);
  });

  it("waits for startup content to settle before building", async () => {
    await mkdir(join(dir, "site-production"), { recursive: true });
    await writeFile(
      join(dir, "site-production", "index.html"),
      "<html></html>",
    );
    expect(await start(0, { settle: false })).toEqual([]);
    await harness.sendMessage(SYSTEM_CHANNELS.startupContentSettled, {});
    const queue = harness.getMockShell().getJobQueueService();
    await waitUntil(
      async () =>
        (await queue.getActiveJobs()).some((job) =>
          job.type.endsWith(":site-build"),
        ),
      "the settled content to request the build",
    );
  });

  it("builds every environment that has an output", async () => {
    for (const env of ["site-production", "site-preview"]) {
      await mkdir(join(dir, env), { recursive: true });
      await writeFile(join(dir, env, "index.html"), "<html></html>");
    }
    expect(await start(2)).toEqual(["preview", "production"]);
  });
});
