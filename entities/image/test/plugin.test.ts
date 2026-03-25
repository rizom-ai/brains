import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ImagePlugin } from "../src/image-plugin";
import { createPluginHarness } from "@brains/plugins/test";

describe("ImagePlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: ImagePlugin;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-image" });
    plugin = new ImagePlugin();
    await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
  });

  it("should register as entity plugin", () => {
    expect(plugin.id).toBe("image");
    expect(plugin.type).toBe("entity");
  });

  it("should register image entity type", () => {
    expect(harness.getEntityService().getEntityTypes()).toContain("image");
  });

  it("should return zero tools", async () => {
    const capabilities = await harness.installPlugin(plugin);
    expect(capabilities.tools).toHaveLength(0);
  });
});
