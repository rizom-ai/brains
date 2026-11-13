import { expect, test } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
} from "../src";
import type { Plugin } from "../src/interfaces";
import { createPluginHarness } from "../src/test/harness";

/** A declared service, holding what setup acquired until it shuts down. */
async function installed(
  cleanup?: () => Promise<void>,
): Promise<{ shutdown(): Promise<void> }> {
  const [plugin]: Plugin[] = instantiatePluginPackageDefinition(
    defineServicePlugin({
      id: "lifecycle-test",
      config: z.object({}),
      setup: ({ lifecycle }) => {
        if (cleanup) lifecycle.onCleanup(cleanup);
        return {};
      },
    }),
    {},
    { name: "@fixture/lifecycle-test", version: "1.0.0" },
  );
  if (!plugin?.shutdown) throw new Error("A declared service shuts down");
  await createPluginHarness({ logger: createSilentLogger() }).installPlugin(
    plugin,
  );
  return { shutdown: plugin.shutdown.bind(plugin) };
}

test("a service that acquired nothing shuts down with nothing to release", async () => {
  const plugin = await installed();
  expect(await plugin.shutdown()).toBeUndefined();
});

test("shutdown awaits what setup registered to release", async () => {
  const gate = Promise.withResolvers<void>();
  let finished = false;
  const plugin = await installed(() => gate.promise);
  const pending = plugin.shutdown().then(() => {
    finished = true;
  });
  await Promise.resolve();
  expect(finished).toBe(false);
  gate.resolve();
  await pending;
  expect(finished).toBe(true);
});

test("shutdown propagates a release's failure", async () => {
  const plugin = await installed(async () => {
    throw new Error("Cleanup failed");
  });
  const error = await plugin.shutdown().catch((cause: unknown) => cause);
  expect(error).toEqual(new Error("Cleanup failed"));
});
