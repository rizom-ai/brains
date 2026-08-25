import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../../src/test/harness";
import {
  defineEntity,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
} from "../../src";
import type { Plugin } from "../../src";

const sighting = defineEntity({
  type: "sighting",
  purpose: "Something noticed on the network.",
  metadata: z.object({ title: z.string() }),
});

const watch = defineServicePlugin({
  id: "watchtower",
  config: z.object({}),
  setup: () => ({}),
  entities: [sighting],
});

describe("notes one package's plugins keep", () => {
  it("are shared between them, because they belong to the package", async () => {
    const harness = createPluginHarness();
    const plugins = instantiatePluginPackageDefinition(
      watch,
      {},
      {
        name: "@fixture/watchtower",
        version: "0.1.0",
      },
    );
    for (const plugin of plugins as Plugin[]) {
      await harness.installPlugin(plugin);
    }

    // What the entity side notices when a card arrives, the service side
    // reports on a schedule. Two plugins of one package, one note.
    const fromEntity = harness.getReactionContext(
      "@fixture/watchtower:sighting",
    );
    const fromService = harness.getReactionContext(
      "@fixture/watchtower:watchtower",
    );

    await fromEntity
      .state({ namespace: "pending", schema: z.string() })
      .set("first", "noticed");

    expect(
      await fromService
        .state({ namespace: "pending", schema: z.string() })
        .get("first"),
    ).toBe("noticed");

    harness.reset();
  });
});
