import { describe, expect, test } from "bun:test";
import { RizomRuntimePlugin } from "../../src/rizom/runtime/plugin";

describe("RizomRuntimePlugin config validation", () => {
  test("accepts a theme package name", () => {
    const plugin = new RizomRuntimePlugin("@rizom/site-rizom-ai", {
      theme: "@brains/theme-rizom",
    });
    expect(plugin.config.theme).toBe("@brains/theme-rizom");
  });

  test("rejects a non-string theme instead of dropping it", () => {
    expect(
      () => new RizomRuntimePlugin("@rizom/site-rizom-ai", { theme: 42 }),
    ).toThrow(/theme/);
  });
});
