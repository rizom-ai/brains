import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { RizomEcosystemPlugin } from "../src/plugin";

describe("RizomEcosystemPlugin", () => {
  it("registers the ecosystem-section entity type", async () => {
    const harness = createPluginHarness({
      dataDir: "/tmp/test-rizom-ecosystem",
    });
    const plugin = new RizomEcosystemPlugin();

    await harness.installPlugin(plugin);

    expect(plugin.type).toBe("entity");
    expect(plugin.id).toBe("rizom-ecosystem");
    expect(harness.getEntityService().getEntityTypes()).toContain(
      "ecosystem-section",
    );
  });
});
