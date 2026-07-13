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

  it("ships a dedicated Socket Mode trial app and start command", async () => {
    const brainYaml = await Bun.file(
      new URL("../test-apps/slack/brain.yaml", import.meta.url),
    ).text();
    const packageJson = (await Bun.file(
      new URL("../package.json", import.meta.url),
    ).json()) as { scripts?: Record<string, string> };

    expect(brainYaml).toContain("preset: core");
    expect(brainYaml).toContain("- chat");
    expect(brainYaml).toContain("- discord");
    expect(brainYaml).toContain("mode: socket");
    expect(brainYaml).toContain("botToken: ${SLACK_BOT_TOKEN}");
    expect(brainYaml).toContain("appToken: ${SLACK_APP_TOKEN}");
    expect(brainYaml).toContain('pattern: "slack:U0BGKJ4MA5B"');
    expect(brainYaml).toContain('pattern: "slack:*"');
    expect(packageJson.scripts?.["start:slack"]).toContain(
      "@brains/chat slack:preflight",
    );
    expect(packageJson.scripts?.["start:slack"]).toContain("test-apps/slack");
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
