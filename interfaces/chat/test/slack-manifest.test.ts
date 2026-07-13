import { describe, expect, it } from "bun:test";

const manifestPath = new URL("../slack-app-manifest.yaml", import.meta.url);

describe("Slack app manifest", () => {
  it("enables Socket Mode with the required scopes and events", async () => {
    const manifest = await Bun.file(manifestPath).text();

    expect(manifest).toContain("socket_mode_enabled: true");
    for (const scope of [
      "app_mentions:read",
      "channels:history",
      "channels:read",
      "chat:write",
      "files:read",
      "groups:history",
      "groups:read",
      "im:history",
      "im:read",
      "mpim:history",
      "mpim:read",
      "users:read",
    ]) {
      expect(manifest).toContain(`- ${scope}`);
    }
    for (const event of [
      "app_mention",
      "message.channels",
      "message.groups",
      "message.im",
      "message.mpim",
    ]) {
      expect(manifest).toContain(`- ${event}`);
    }
    expect(manifest).not.toContain("request_url:");
  });
});
