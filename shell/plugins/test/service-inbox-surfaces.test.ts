import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * What `@brains/unified-inbox` needs that the declarative surface could not
 * say: the inbox registries other packages file into, and a console link to
 * the workspace it registers.
 */

describe("a service that reads the inbox registries", () => {
  it("hands setup the sources other packages filed", async () => {
    let sourceCount: number | undefined;
    const definition = defineServicePlugin({
      id: "inbox-desk",
      config: z.object({}),
      setup: ({ inbox }) => ({
        sources: (): number => inbox.listSources().length,
      }),
      ready: ({ state }) => {
        sourceCount = state.sources();
      },
    });
    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/inbox-desk", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");

    const harness = createPluginHarness();
    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    await plugin.ready?.();

    expect(sourceCount).toBe(0);
  });
});

describe("a service that offers a way in", () => {
  it("declares its console link", async () => {
    const definition = defineServicePlugin({
      id: "inbox-desk",
      config: z.object({}),
      setup: () => ({}),
      interactions: () => [
        {
          id: "unified-inbox",
          label: "Inbox",
          description: "Review source-owned items that need attention.",
          href: "/studio/workspaces/inbox",
          kind: "admin",
          priority: 20,
          visibility: "admin",
        },
      ],
    });
    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/inbox-desk", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");

    const harness = createPluginHarness();
    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    await plugin.ready?.();

    expect(
      harness
        .getMockShell()
        .listInteractions()
        .map((interaction) => interaction.id),
    ).toContain("unified-inbox");
  });
});
