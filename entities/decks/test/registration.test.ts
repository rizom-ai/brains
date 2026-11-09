import { describe, expect, it } from "bun:test";
import { publishRegisterContract } from "@brains/contracts";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { decksPlugin } from "./decks-plugin";

/**
 * What the decks register, pinned as the decks plugin class registered it:
 * other packages, sites and the content pipeline name these by string.
 */
async function installed(): Promise<{
  harness: ReturnType<typeof createPluginHarness>;
  evals: string[];
  capabilities: Awaited<
    ReturnType<ReturnType<typeof createPluginHarness>["installPlugin"]>
  >;
}> {
  const harness = createPluginHarness({
    logger: createSilentLogger("decks-registration"),
  });
  const evals: string[] = [];
  harness.getMockShell().registerEvalHandler = (pluginId, id): void => {
    evals.push(`${pluginId}:${id}`);
  };
  const capabilities = await harness.installPlugin(decksPlugin());
  return { harness, evals, capabilities };
}

describe("the decks' registered surface", () => {
  it("registers the deck type under the decks plugin", async () => {
    const { harness, capabilities } = await installed();
    const plugin = harness.getPlugin();
    expect(plugin.id).toBe("decks");
    expect(plugin.type).toBe("entity");
    expect(plugin.packageName).toBe("@brains/decks");
    expect(capabilities.tools).toEqual([]);
    expect(capabilities.resources).toEqual([]);
    expect(capabilities.instructions).toBeUndefined();
    expect(capabilities.projectionRules).toBeUndefined();
    const registry = harness.getEntityRegistry();
    expect(registry.getEntityTypeConfig("deck")).toMatchObject({
      weight: 1.5,
      projectionSourceRole: "primary",
    });
    const adapter = registry.getAdapter("deck");
    expect(adapter.purpose).toBe("A slide-deck presentation.");
    expect(adapter.supportsCoverImage).toBe(true);
    expect(adapter.buildStub).toBeDefined();
  });

  it("registers its templates under the names sites and jobs use", async () => {
    const { harness } = await installed();
    expect(
      [...harness.getTemplates()]
        .filter(([name]) => name.startsWith("decks:"))
        .map(([name, template]) => [name, template.dataSourceId ?? null])
        .sort(),
    ).toEqual([
      ["decks:carousel", null],
      ["decks:deck-detail", "decks:entities"],
      ["decks:deck-list", "decks:entities"],
      ["decks:description", "shell:ai-content"],
      ["decks:generation", "shell:ai-content"],
      ["decks:og-image", null],
    ]);
  });

  it("registers its data source, job types and eval handlers", async () => {
    const { harness, evals } = await installed();
    expect(
      [...harness.getDataSources().keys()].filter((id) =>
        id.startsWith("decks:"),
      ),
    ).toEqual(["decks:entities"]);
    expect(
      harness.getMockShell().getJobQueueService().getRegisteredTypes(),
    ).toEqual(["deck:generation"]);
    expect(evals.sort()).toEqual([
      "decks:generateDeck",
      "decks:generateDescription",
    ]);
  });

  it("registers its attachments and its AT Protocol projection", async () => {
    const { harness } = await installed();
    const shell = harness.getMockShell();
    for (const attachmentType of ["carousel", "og-image"]) {
      expect(
        shell.getAttachmentRegistry().hasProvider("deck", attachmentType),
      ).toBe(true);
    }
    expect(shell.getAtprotoProjectionRegistry().get("deck")).toMatchObject({
      collection: "ai.rizom.brain.deck",
      validate: false,
    });
  });

  it("registers the deck with the publish pipeline once plugins are in", async () => {
    const { harness } = await installed();
    const registered: unknown[] = [];
    harness.subscribe(publishRegisterContract.name, async (message) => {
      registered.push(message.payload);
      return { success: true };
    });
    await harness.sendMessage(
      SYSTEM_CHANNELS.pluginsRegistered,
      { timestamp: new Date().toISOString(), pluginCount: 1 },
      "shell",
      true,
    );
    expect(registered).toEqual([
      {
        entityType: "deck",
        provider: expect.objectContaining({ name: "internal" }),
        config: { executionMode: "provider" },
      },
    ]);
  });
});
