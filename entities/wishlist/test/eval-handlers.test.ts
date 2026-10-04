import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { createPluginHarness } from "@brains/plugins/test";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import wishlist from "../src";

describe("declared wishlist evals", () => {
  it("registers the sameWish eval handler", async () => {
    const harness = createPluginHarness({
      dataDir: `/tmp/test-wishlist-evals-${randomUUID()}`,
    });
    const registrations: string[] = [];
    harness.getMockShell().registerEvalHandler = (
      pluginId,
      handlerId,
    ): void => {
      registrations.push(`${pluginId}:${handlerId}`);
    };

    for (const plugin of instantiatePluginPackageDefinition(
      wishlist,
      {},
      { name: "@brains/wishlist", version: "0.0.0-test" },
    ))
      await harness.installPlugin(plugin);

    expect(registrations).toEqual(["@brains/wishlist:wish:sameWish"]);
  });
});
