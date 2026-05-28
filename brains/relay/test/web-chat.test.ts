import { describe, expect, it } from "bun:test";
import { resolve } from "@brains/app";
import relay from "../src";

describe("relay web-chat", () => {
  it("includes web-chat in the core preset", () => {
    const config = resolve(relay, {}, { preset: "core" });
    const pluginIds = config.plugins?.map((plugin) => plugin.id) ?? [];

    expect(pluginIds).toContain("web-chat");
  });

  it("includes web-chat in the default preset", () => {
    const config = resolve(relay, {}, { preset: "default" });
    const pluginIds = config.plugins?.map((plugin) => plugin.id) ?? [];

    expect(pluginIds).toContain("web-chat");
  });

  it("can remove web-chat explicitly", () => {
    const config = resolve(
      relay,
      {},
      { preset: "default", remove: ["web-chat"] },
    );
    const pluginIds = config.plugins?.map((plugin) => plugin.id) ?? [];

    expect(pluginIds).not.toContain("web-chat");
  });
});
