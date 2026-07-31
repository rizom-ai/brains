import { describe, expect, it } from "bun:test";
import { resolve } from "@brains/app";
import rover from "../src/index";

describe("Rover ChatInterface", () => {
  it("ships chat in every preset as the only chat transport", () => {
    expect(rover.presets?.core).toContain("chat");
    expect(rover.presets?.default).toContain("chat");
    expect(rover.presets?.full).toContain("chat");
    expect(rover.evalDisable).toContain("chat");

    const interfaceIds = rover.interfaces.map(([id]) => id);
    expect(interfaceIds).not.toContain("discord");
  });

  it("ships a dedicated Socket Mode trial app and start command", async () => {
    const brainYaml = await Bun.file(
      new URL("../test-apps/slack/brain.yaml", import.meta.url),
    ).text();
    const packageJson = (await Bun.file(
      new URL("../package.json", import.meta.url),
    ).json()) as { scripts?: Record<string, string> };

    expect(brainYaml).toContain("preset: core");
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

  it("wires the Discord adapter from env without a brain.yaml override", () => {
    const config = resolve(
      rover,
      {
        DISCORD_BOT_TOKEN: "discord-token",
        DISCORD_PUBLIC_KEY: "a".repeat(64),
        DISCORD_APPLICATION_ID: "discord-application-id",
      },
      { preset: "core" },
    );
    const chat = (config.plugins ?? []).find((plugin) => plugin.id === "chat");

    expect(chat).toBeDefined();
    expect(chat?.packageName).toBe("@brains/chat");
  });

  it("can be dropped from a local trial with a remove override", () => {
    const config = resolve(rover, {}, { preset: "core", remove: ["chat"] });
    const plugins = config.plugins ?? [];

    expect(plugins.map((plugin) => plugin.id)).not.toContain("chat");
    expect(plugins.map((plugin) => plugin.packageName)).not.toContain(
      "@brains/chat",
    );
  });
});
