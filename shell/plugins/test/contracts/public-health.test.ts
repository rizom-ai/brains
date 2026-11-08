import { describe, expect, it } from "bun:test";
import {
  publicHealthInfoSchema,
  toPublicHealthInfo,
} from "../../src/contracts/public-health";
import { createMockAppInfo } from "../../src/test/mock-app-info";

describe("public health info", () => {
  const appInfo = createMockAppInfo({
    model: "rover",
    version: "0.2.0-alpha.46",
    uptime: 42,
    entities: 7,
    entityCounts: [{ entityType: "note", count: 7 }],
    embeddings: 7,
    daemons: [
      {
        name: "webserver:webserver",
        pluginId: "webserver",
        status: "running",
        health: {
          status: "healthy",
          message:
            "Production: https://example.com, Preview: https://preview.example.com",
          lastCheck: "2026-01-01T00:00:00.000Z",
          details: { previewUrl: "https://preview.example.com" },
        },
      },
      { name: "discord:discord", pluginId: "discord", status: "stopped" },
    ],
    endpoints: [
      {
        label: "Preview",
        url: "https://preview.example.com",
        pluginId: "webserver",
        priority: 20,
        visibility: "admin",
      },
    ],
    interactions: [
      {
        id: "preview",
        label: "Preview site",
        href: "https://preview.example.com",
        kind: "admin",
        pluginId: "webserver",
        priority: 20,
        visibility: "admin",
        status: "available",
      },
    ],
  });

  it("keeps version, uptime and daemon state", () => {
    expect(toPublicHealthInfo(appInfo)).toEqual({
      version: "0.2.0-alpha.46",
      uptime: 42,
      daemons: [
        {
          name: "webserver:webserver",
          pluginId: "webserver",
          status: "running",
          health: { status: "healthy", lastCheck: "2026-01-01T00:00:00.000Z" },
        },
        { name: "discord:discord", pluginId: "discord", status: "stopped" },
      ],
    });
  });

  it("carries no counts, totals, models, endpoints, interactions or daemon messages", () => {
    const info = toPublicHealthInfo(appInfo);

    expect(publicHealthInfoSchema.strict().parse(info)).toEqual(info);
    expect(JSON.stringify(info)).not.toContain("preview.example.com");
    expect(JSON.stringify(info)).not.toContain("rover");
  });
});
