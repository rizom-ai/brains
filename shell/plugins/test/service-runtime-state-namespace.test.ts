import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import type { IRuntimeStateStore } from "@brains/runtime-state";
import { createPluginHarness } from "../src/test/harness";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * Where a package's bookkeeping is filed, which is not a naming question.
 *
 * The accessor a service reaches this through is being renamed, so this pins
 * the part a rename must never move: the namespace it is stored under. A
 * package that upgrades and finds its notes under a different key has lost
 * them, and the loss is silent — it reads an empty store and carries on.
 */
describe("where a service's runtime state is filed", () => {
  const harness = createPluginHarness();

  it("files it under the package name, whatever the accessor is called", async () => {
    const attempts = z.number();
    let store: IRuntimeStateStore<number> | undefined;

    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin({
        id: "mail",
        config: z.object({}),
        setup: ({ runtimeState }) => {
          store = runtimeState({
            namespace: "classification-attempts",
            schema: attempts,
          });
          return { store };
        },
      }),
      {},
      { name: "@brains/email-workflows", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");
    await harness.installPlugin(plugin);

    if (!store) throw new Error("Setup did not scope a store");
    await store.set("message-1", 2);

    // Read it back through the namespace the package's notes have always been
    // stored under, scoped directly rather than through the package.
    const onDisk = harness.getMockShell().getRuntimeState().scoped({
      namespace: "brains.email-workflows.classification-attempts",
      schema: attempts,
    });

    expect(await onDisk.get("message-1")).toBe(2);

    await harness.reset();
  });
});
