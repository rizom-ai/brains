import { describe, expect, it } from "bun:test";
import { resolve } from "@brains/app";
import rover from "../src";

describe("rover presets", () => {
  it("includes document support in the full preset", () => {
    const config = resolve(rover, {}, { preset: "full" });
    const pluginIds = config.plugins?.map((plugin) => plugin.id) ?? [];

    expect(pluginIds).toContain("document");
  });
});
