import { expect, test } from "bun:test";
import { z } from "@brains/utils/zod";
import { ServicePlugin } from "../src/service/service-plugin";

class DefaultLifecyclePlugin extends ServicePlugin<
  Record<string, never>,
  Record<string, never>
> {
  constructor() {
    super(
      "lifecycle-test",
      { name: "lifecycle-test", version: "1.0.0" },
      {},
      z.object({}),
    );
  }
}

class CleanupPlugin extends DefaultLifecyclePlugin {
  private readonly cleanup: () => Promise<void>;
  constructor(cleanup: () => Promise<void>) {
    super();
    this.cleanup = cleanup;
  }
  protected override async onShutdown(): Promise<void> {
    await this.cleanup();
  }
}

test("concrete plugins always expose a callable shutdown with a default no-op hook", async () => {
  // Compile-time canary: the concrete method is mandatory even though the
  // general Plugin interface permits implementations without lifecycle hooks.
  const plugin: { shutdown(): Promise<void> } = new DefaultLifecyclePlugin();
  expect(await plugin.shutdown()).toBeUndefined();
});

test("shutdown awaits the overridden cleanup hook", async () => {
  const gate = Promise.withResolvers<void>();
  let finished = false;
  const plugin = new CleanupPlugin(() => gate.promise);
  const pending = plugin.shutdown().then(() => {
    finished = true;
  });
  await Promise.resolve();
  expect(finished).toBe(false);
  gate.resolve();
  await pending;
  expect(finished).toBe(true);
});

test("shutdown propagates cleanup failures", async () => {
  const plugin = new CleanupPlugin(async () => {
    throw new Error("Cleanup failed");
  });
  const error = await plugin.shutdown().catch((cause: unknown) => cause);
  expect(error).toEqual(new Error("Cleanup failed"));
});
