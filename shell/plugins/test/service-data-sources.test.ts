import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineDataSource,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * A service that contributes a data source without owning an entity type.
 *
 * `@brains/knowledge-map` arranges the whole corpus in semantic space —
 * `project({})` takes no type filter, so the source spans every type and
 * belongs to no one of them. Same shape in dashboard, site-builder and
 * unified-inbox.
 */

describe("data sources a service declares", () => {
  it("registers them under the package, and hands them entity reads", async () => {
    const definition = defineServicePlugin({
      id: "cartographer",
      config: z.object({}),
      setup: () => ({}),
      dataSources: () => [
        defineDataSource({
          id: "map",
          name: "Corpus Map",
          description: "The whole corpus in semantic space.",
          fetch: async (_query, entities) => ({
            types: entities.getEntityTypes().length,
          }),
        }),
      ],
    });

    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/cartographer", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");

    const harness = createPluginHarness();
    await harness.installPlugin(plugin);

    const ids = Array.from(harness.getDataSources().keys());
    expect(ids).toContain("@fixture/cartographer:map");
  });
});
