import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { webChatConfigSchema } from "../src/config";
import { resolveGuestPreset } from "../src/guest-preset";
import { WebChatInterface } from "../src/web-chat-interface";

describe("guest configuration conventions", () => {
  it("stays off by default and allows explicit disabling", () => {
    expect(resolveGuestPreset(webChatConfigSchema.parse({}).guest)).toEqual({
      enabled: false,
    });
    expect(webChatConfigSchema.parse({ guest: false }).guest).toBe(false);
  });

  it("resolves one opt-in without expanding the saved configuration", () => {
    const config = webChatConfigSchema.parse({ guest: "local-test" });
    expect(config.guest).toBe("local-test");
    expect(
      webChatConfigSchema.parse(JSON.parse(JSON.stringify(config))),
    ).toEqual(config);
    expect(resolveGuestPreset(config.guest)).toMatchObject({
      enabled: true,
      origin: "http://127.0.0.1:8080",
      budget: { dailyUsd: 4, maxTurnUsd: 2 },
      retention: { idleSeconds: 3600, maxAgeSeconds: 3600 },
      limits: {
        userTurns: 2,
        globalConcurrency: 1,
        globalRequestsPerDay: 2,
        contextTokens: 1_050_000,
        contextBytes: 32000,
        outputTokens: 1200,
        toolCalls: 3,
        toolSteps: 3,
        streamIdleTimeoutSeconds: 30,
      },
      disclosure: { provider: "OpenAI (gpt-5.6-luna)" },
    });
  });

  it("allows a local origin override without requiring any policy knobs", () => {
    const config = webChatConfigSchema.parse({
      guest: { preset: "local-test", origin: "http://127.0.0.1:18180" },
    });
    expect(resolveGuestPreset(config.guest)).toMatchObject({
      origin: "http://127.0.0.1:18180",
      budget: { dailyUsd: 4, maxTurnUsd: 2 },
    });
  });

  it.each([
    true,
    "production",
    { enabled: true },
    { preset: "local-test", budget: { dailyUsd: 100 } },
    { preset: "local-test", limits: { toolCalls: 100 } },
    ...[
      "https://brain.example",
      "http://brain.example",
      "http://0.0.0.0:8080",
      "http://localhost:8080/",
      "http://user@localhost:8080",
    ].map((origin) => ({ preset: "local-test", origin })),
  ])("rejects unsupported deployment policy: %j", (guest) => {
    expect(webChatConfigSchema.safeParse({ guest }).success).toBe(false);
  });

  it("resolves independent policy objects", () => {
    const first = resolveGuestPreset("local-test");
    const second = resolveGuestPreset("local-test");
    if (!first.enabled || !second.enabled)
      throw new Error("Expected enabled policies");
    first.limits.outputTokens = 1;
    expect(second.limits.outputTokens).toBe(1200);
  });

  it("does not turn the preset into runtime admission", async () => {
    const harness = createPluginHarness<WebChatInterface>();
    const plugin = new WebChatInterface({ guest: "local-test" });
    try {
      await harness.installPlugin(plugin);
      const route = plugin
        .getWebRoutes()
        .find(
          (route) =>
            route.path === "/api/chat/guest/session" && route.method === "POST",
        );
      if (!route) throw new Error("Missing guest session route");
      const response = await route.handler(
        new Request("http://127.0.0.1:8080/api/chat/guest/session", {
          method: "POST",
          headers: {
            Origin: "http://127.0.0.1:8080",
            "Content-Type": "application/json",
          },
          body: "{}",
        }),
        { remoteAddress: "127.0.0.1" },
      );
      expect(response.status).toBe(503);
      expect(response.headers.has("Set-Cookie")).toBe(false);
    } finally {
      await harness.reset();
    }
  });
});
