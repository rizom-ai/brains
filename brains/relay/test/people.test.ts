import { describe, expect, it } from "bun:test";
import { resolve } from "@brains/app";
import relay from "../src";

describe("relay account and admin consoles", () => {
  it("includes both standalone surfaces in every preset", () => {
    for (const preset of ["core", "default", "full"] as const) {
      const config = resolve(relay, {}, { preset });
      const pluginIds = config.plugins?.map((plugin) => plugin.id) ?? [];

      expect(pluginIds).toContain("account");
      expect(pluginIds).toContain("admin");
    }
  });
});
