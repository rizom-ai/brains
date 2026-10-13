import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { createPluginHarness } from "@brains/plugins/test";
import { WishlistPlugin } from "../src";

describe("WishlistPlugin evals", () => {
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

    await harness.installPlugin(new WishlistPlugin());

    expect(registrations).toEqual(["wishlist:sameWish"]);
  });
});
