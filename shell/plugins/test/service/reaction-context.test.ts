import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../../src/test/harness";
import {
  defineEntity,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
} from "../../src";
import type { Plugin } from "../../src";

const noteSchema = z.object({ title: z.string() });

const note = defineEntity({
  type: "harness-note",
  purpose: "A note, for exercising the harness.",
  metadata: noteSchema,
});

const notes = defineServicePlugin({
  id: "notekeeper",
  config: z.object({}),
  setup: () => ({}),
  entities: [note],
});

describe("the context a declared reaction runs in", () => {
  it("is available from the harness, so a check or inbox can be driven directly", async () => {
    const harness = createPluginHarness();
    const plugins = instantiatePluginPackageDefinition(
      notes,
      {},
      {
        name: "@fixture/notekeeper",
        version: "0.1.0",
      },
    );
    for (const plugin of plugins as Plugin[]) {
      await harness.installPlugin(plugin);
    }

    const context = harness.getReactionContext("notekeeper");

    await context.entities.create({
      id: "first",
      entityType: "harness-note",
      content: "Hello",
      metadata: { title: "First" },
    });
    const stored = await context.entities.getEntity({
      entityType: "harness-note",
      id: "first",
    });
    expect(stored?.id).toBe("first");

    // Notes a package keeps are namespaced to it, so two packages using the
    // same namespace name cannot read each other's.
    const state = context.state({ namespace: "seen", schema: z.string() });
    await state.set("key", "value");
    expect(await state.get("key")).toBe("value");

    expect(typeof context.permissions.assertEntityActionAllowed).toBe(
      "function",
    );

    harness.reset();
  });
});
