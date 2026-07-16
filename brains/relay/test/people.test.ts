import { describe, expect, it } from "bun:test";
import { resolve } from "@brains/app";
import relay from "../src";

describe("relay admin console", () => {
  it("includes the standalone surface in every preset", () => {
    for (const preset of ["core", "default", "full"] as const) {
      const config = resolve(relay, {}, { preset });
      const pluginIds = config.plugins?.map((plugin) => plugin.id) ?? [];

      expect(pluginIds).toContain("admin");
    }
  });
});
