import { describe, expect, test } from "bun:test";
import { RizomRuntimePlugin } from "../src/runtime/plugin";

describe("RizomRuntimePlugin config validation", () => {
  test("accepts a valid themeProfile", () => {
    const plugin = new RizomRuntimePlugin("@rizom/site-rizom", {
      themeProfile: "studio",
    });
    expect(plugin.config.themeProfile).toBe("studio");
  });

  test("rejects an invalid themeProfile instead of dropping it", () => {
    expect(
      () =>
        new RizomRuntimePlugin("@rizom/site-rizom", { themeProfile: "Studio" }),
    ).toThrow(/themeProfile/);
  });

  test("rejects a non-string theme instead of dropping it", () => {
    expect(
      () => new RizomRuntimePlugin("@rizom/site-rizom", { theme: 42 }),
    ).toThrow(/theme/);
  });
});
