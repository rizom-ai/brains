import { describe, expect, it } from "bun:test";
import { resolve } from "@brains/app";
import rover from "../src";

describe("rover web-chat opt-in", () => {
  it("does not include web-chat in presets by default", () => {
    const config = resolve(rover, {}, { preset: "default" });
    const pluginIds = config.plugins?.map((plugin) => plugin.id) ?? [];

    expect(pluginIds).not.toContain("web-chat");
  });

  it("registers web-chat when explicitly added", () => {
    const config = resolve(rover, {}, { preset: "default", add: ["web-chat"] });
    const pluginIds = config.plugins?.map((plugin) => plugin.id) ?? [];

    expect(pluginIds).toContain("web-chat");
  });
});
