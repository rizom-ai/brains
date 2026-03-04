import { describe, it, expect } from "bun:test";
import { CorePlugin } from "../src/core/core-plugin";
import { ServicePlugin } from "../src/service/service-plugin";
import { createPluginHarness } from "../src/test/harness";
import { z } from "@brains/utils";

class PluginWithInstructions extends CorePlugin<Record<string, never>> {
  constructor() {
    super(
      "instructed-plugin",
      { name: "instructed-plugin", version: "1.0.0" },
      {},
      z.object({}),
    );
  }

  protected override async getInstructions(): Promise<string> {
    return "Always greet the user before responding.";
  }
}

class PluginWithoutInstructions extends CorePlugin<Record<string, never>> {
  constructor() {
    super(
      "plain-plugin",
      { name: "plain-plugin", version: "1.0.0" },
      {},
      z.object({}),
    );
  }
}

class ServicePluginWithInstructions extends ServicePlugin<
  Record<string, never>
> {
  constructor() {
    super(
      "service-instructed",
      { name: "service-instructed", version: "1.0.0" },
      {},
      z.object({}),
    );
  }

  protected override async getInstructions(): Promise<string> {
    return "Log unfulfilled requests to the wishlist.";
  }
}

describe("Plugin Instructions", () => {
  describe("CorePlugin", () => {
    it("should include instructions in capabilities when provided", async () => {
      const harness = createPluginHarness();
      const capabilities = await harness.installPlugin(
        new PluginWithInstructions(),
      );

      expect(capabilities.instructions).toBe(
        "Always greet the user before responding.",
      );
    });

    it("should not include instructions when not provided", async () => {
      const harness = createPluginHarness();
      const capabilities = await harness.installPlugin(
        new PluginWithoutInstructions(),
      );

      expect(capabilities.instructions).toBeUndefined();
    });
  });

  describe("ServicePlugin", () => {
    it("should include instructions in capabilities when provided", async () => {
      const harness = createPluginHarness();
      const capabilities = await harness.installPlugin(
        new ServicePluginWithInstructions(),
      );

      expect(capabilities.instructions).toBe(
        "Log unfulfilled requests to the wishlist.",
      );
    });
  });
});
