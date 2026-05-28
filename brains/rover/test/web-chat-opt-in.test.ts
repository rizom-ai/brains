import { describe, expect, it } from "bun:test";
import { resolve } from "@brains/app";
import rover from "../src";

describe("rover web-chat", () => {
  it("includes web-chat in the core preset", () => {
    const config = resolve(rover, {}, { preset: "core" });
    const pluginIds = config.plugins?.map((plugin) => plugin.id) ?? [];

    expect(pluginIds).toContain("web-chat");
  });

  it("includes web-chat in the default preset", () => {
    const config = resolve(rover, {}, { preset: "default" });
    const pluginIds = config.plugins?.map((plugin) => plugin.id) ?? [];

    expect(pluginIds).toContain("web-chat");
  });

  it("can remove web-chat explicitly", () => {
    const config = resolve(
      rover,
      {},
      { preset: "default", remove: ["web-chat"] },
    );
    const pluginIds = config.plugins?.map((plugin) => plugin.id) ?? [];

    expect(pluginIds).not.toContain("web-chat");
  });
});
