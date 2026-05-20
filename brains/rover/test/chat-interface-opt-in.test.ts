import { describe, expect, it } from "bun:test";
import { resolve } from "@brains/app";
import rover from "../src/index";

describe("Rover ChatInterface opt-in", () => {
  it("keeps ChatInterface out of default presets", () => {
    expect(rover.presets?.core).not.toContain("chat");
    expect(rover.presets?.default).not.toContain("chat");
    expect(rover.presets?.full).not.toContain("chat");
    expect(rover.evalDisable).toContain("chat");
  });

  it("can switch local trials from discord to chat with add/remove overrides", () => {
    const config = resolve(
      rover,
      {},
      {
        preset: "core",
        add: ["chat"],
        remove: ["discord"],
        plugins: {
          chat: {
            adapters: {
              discord: {
                botToken: "discord-token",
                publicKey: "discord-public-key",
                applicationId: "discord-application-id",
              },
            },
          },
        },
      },
    );
    const plugins = config.plugins ?? [];
    const pluginIds = plugins.map((plugin) => plugin.id);
    const packageNames = plugins.map((plugin) => plugin.packageName);

    expect(pluginIds).toContain("chat");
    expect(packageNames).toContain("@brains/chat");
    expect(pluginIds).not.toContain("discord");
    expect(packageNames).not.toContain("@brains/discord");
  });
});
