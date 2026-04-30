import { describe, expect, it } from "bun:test";
import { AppInfoSchema } from "../../src/contracts/app-info";
import { toPublicAppInfo } from "../../src/base/public-app-info";

describe("public app info contracts", () => {
  it("maps internal app info to the stable public contract", () => {
    const publicAppInfo = toPublicAppInfo({
      model: "rover",
      version: "0.2.0-alpha.46",
      uptime: 42,
      entities: 7,
      embeddings: 3,
      ai: {
        model: "claude-sonnet",
        embeddingModel: "text-embedding-3-small",
      },
      daemons: [
        {
          name: "discord",
          pluginId: "discord-interface",
          status: "running",
          health: {
            status: "healthy",
            message: "ok",
            lastCheck: new Date("2026-01-01T00:00:00.000Z"),
            details: { latencyMs: 12 },
          },
        },
      ],
      endpoints: [
        {
          label: "Dashboard",
          url: "https://example.com/dashboard",
          pluginId: "dashboard",
          priority: 10,
        },
      ],
    });

    expect(AppInfoSchema.parse(publicAppInfo)).toEqual({
      model: "rover",
      version: "0.2.0-alpha.46",
      uptime: 42,
      entities: 7,
      embeddings: 3,
      ai: {
        model: "claude-sonnet",
        embeddingModel: "text-embedding-3-small",
      },
      daemons: [
        {
          name: "discord",
          pluginId: "discord-interface",
          status: "running",
          health: {
            status: "healthy",
            message: "ok",
            lastCheck: "2026-01-01T00:00:00.000Z",
            details: { latencyMs: 12 },
          },
        },
      ],
      endpoints: [
        {
          label: "Dashboard",
          url: "https://example.com/dashboard",
          pluginId: "dashboard",
          priority: 10,
        },
      ],
    });
  });
});
