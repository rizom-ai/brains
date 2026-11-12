import { describe, it, expect } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { promptPlugin } from "./prompt-plugin";

describe("PromptPlugin", () => {
  it("should register as entity plugin", async () => {
    const plugin = promptPlugin();
    const harness = createPluginHarness({
      logger: createSilentLogger("prompt-test"),
    });

    await harness.installPlugin(plugin);

    expect(plugin.id).toBe("prompt");
    expect(plugin.entityType).toBe("prompt");
    expect(plugin.type).toBe("entity");
    expect(harness.getEntityService().getEntityTypes()).toContain("prompt");

    await harness.reset();
  });

  it("should have correct plugin metadata", () => {
    const plugin = promptPlugin();
    expect(plugin.type).toBe("entity");
    expect(plugin.entityType).toBe("prompt");
    expect(plugin.version).toBeDefined();
  });

  it("should not be embeddable (excluded from search)", async () => {
    const harness = createPluginHarness({
      logger: createSilentLogger("prompt-test"),
    });
    await harness.installPlugin(promptPlugin());

    const config = harness.getEntityRegistry().getEntityTypeConfig("prompt");
    expect(config).toBeDefined();
    expect(config.embeddable).toBe(false);
    expect(config).toMatchObject({
      classification: "system",
      projectionSource: false,
      projectionSourceRole: "excluded",
    });

    await harness.reset();
  });
});
