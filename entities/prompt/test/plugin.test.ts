import { describe, it, expect } from "bun:test";
import { PromptPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";

describe("PromptPlugin", () => {
  it("should register as entity plugin", async () => {
    const plugin = new PromptPlugin();
    const harness = createPluginHarness({
      logger: createSilentLogger("prompt-test"),
    });

    await harness.installPlugin(plugin);

    expect(plugin.id).toBe("prompt");
    expect(plugin.entityType).toBe("prompt");
    expect(plugin.type).toBe("entity");

    harness.reset();
  });

  it("should have correct plugin metadata", () => {
    const plugin = new PromptPlugin();
    expect(plugin.type).toBe("entity");
    expect(plugin.entityType).toBe("prompt");
    expect(plugin.version).toBeDefined();
  });

  it("should not be embeddable (excluded from search)", () => {
    const plugin = new PromptPlugin();
    const config = plugin.getEntityTypeConfig();
    expect(config?.embeddable).toBe(false);
  });
});
