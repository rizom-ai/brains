import { describe, test, expect, mock, beforeEach } from "bun:test";
import { RebuildManager } from "../../src/lib/auto-rebuild";
import { createTestConfig } from "../test-helpers";
import type { ServicePluginContext } from "@brains/plugins";

function createMockContext(): ServicePluginContext {
  return {
    messaging: {
      subscribe: mock(() => () => {}),
      send: mock(() => Promise.resolve()),
    },
    jobs: {
      enqueue: mock(() => Promise.resolve("job-1")),
    },
    logger: {
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
    },
  } as unknown as ServicePluginContext;
}

describe("RebuildManager", () => {
  let context: ServicePluginContext;

  beforeEach(() => {
    context = createMockContext();
  });

  test("requestBuild defaults to preview when previewOutputDir is set", async () => {
    const config = createTestConfig();
    const manager = new RebuildManager(
      config,
      context,
      "site-builder",
      context.logger,
    );

    manager.requestBuild();

    // The debounce fires immediately on first trigger (leading edge).
    // Wait a tick for the async enqueue call.
    await new Promise((r) => setTimeout(r, 10));

    const enqueue = context.jobs.enqueue as ReturnType<typeof mock>;
    expect(enqueue).toHaveBeenCalled();
    const call = enqueue.mock.calls[0];
    const data = call?.[0]?.data;
    expect(data.environment).toBe("preview");
    expect(data.outputDir).toBe("./dist/site-preview");

    manager.dispose();
  });

  test("requestBuild defaults to production when previewOutputDir is empty", async () => {
    const config = createTestConfig({ previewOutputDir: "" });
    const manager = new RebuildManager(
      config,
      context,
      "site-builder",
      context.logger,
    );

    manager.requestBuild();

    await new Promise((r) => setTimeout(r, 10));

    const enqueue = context.jobs.enqueue as ReturnType<typeof mock>;
    expect(enqueue).toHaveBeenCalled();
    const data = enqueue.mock.calls[0]?.[0]?.data;
    expect(data.environment).toBe("production");

    manager.dispose();
  });

  test("explicit environment overrides the default", async () => {
    const config = createTestConfig();
    const manager = new RebuildManager(
      config,
      context,
      "site-builder",
      context.logger,
    );

    manager.requestBuild("production");

    await new Promise((r) => setTimeout(r, 10));

    const enqueue = context.jobs.enqueue as ReturnType<typeof mock>;
    expect(enqueue).toHaveBeenCalled();
    const data = enqueue.mock.calls[0]?.[0]?.data;
    expect(data.environment).toBe("production");
    expect(data.outputDir).toBe("./dist/site-production");

    manager.dispose();
  });
});
