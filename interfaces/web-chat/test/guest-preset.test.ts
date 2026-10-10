import { describe, expect, it, spyOn } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { webChatConfigSchema } from "../src/config";
import { resolveGuestPreset } from "../src/guest-preset";
import { WebChatInterface } from "../src/web-chat-interface";

describe("guest configuration conventions", () => {
  it("stays off by default and allows explicit disabling", () => {
    expect(
      resolveGuestPreset(webChatConfigSchema.parse({}).guest, "gpt-5.6-luna"),
    ).toEqual({ enabled: false });
    expect(webChatConfigSchema.parse({ guest: false }).guest).toBe(false);
  });

  it("resolves one opt-in without expanding the saved configuration", () => {
    const config = webChatConfigSchema.parse({ guest: "local-test" });
    expect(config.guest).toBe("local-test");
    expect(
      webChatConfigSchema.parse(JSON.parse(JSON.stringify(config))),
    ).toEqual(config);
    expect(resolveGuestPreset(config.guest, "gpt-5.6-luna")).toMatchObject({
      enabled: true,
      origin: "http://127.0.0.1:8080",
      budget: { dailyUsd: 4, maxTurnUsd: 0.05 },
      retention: { idleSeconds: 3600, maxAgeSeconds: 3600 },
      limits: {
        userTurns: 10,
        globalConcurrency: 3,
        globalRequestsPerDay: 300,
        messageCharacters: 4000,
        requestTimeoutSeconds: 180,
      },
      disclosure: { provider: "OpenAI (gpt-5.6-luna)" },
    });
  });

  it("allows a local origin override without requiring any policy knobs", () => {
    const config = webChatConfigSchema.parse({
      guest: { preset: "local-test", origin: "http://127.0.0.1:18180" },
    });
    expect(resolveGuestPreset(config.guest, "gpt-5.6-luna")).toMatchObject({
      origin: "http://127.0.0.1:18180",
      budget: { dailyUsd: 4, maxTurnUsd: 0.05 },
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
    const first = resolveGuestPreset("local-test", "gpt-5.6-luna");
    const second = resolveGuestPreset("local-test", "gpt-5.6-luna");
    if (!first.enabled || !second.enabled)
      throw new Error("Expected enabled policies");
    first.limits.messageCharacters = 1;
    expect(second.limits.messageCharacters).toBe(4000);
  });

  it.each([
    ["gpt-5.6-luna", "OpenAI (gpt-5.6-luna)", "OpenAI"],
    ["openai:gpt-6-luna", "OpenAI (gpt-6-luna)", "OpenAI"],
    ["claude-sonnet-5", "Anthropic (claude-sonnet-5)", "Anthropic"],
  ])(
    "discloses the provider the configured model %s sends guest text to",
    (model, provider, name) => {
      const policy = resolveGuestPreset("local-test", model);
      if (!policy.enabled) throw new Error("Expected an enabled policy");
      expect(policy.disclosure.provider).toBe(provider);
      expect(policy.disclosure.notice).toContain(
        `Messages and retrieved public text reach this Brain and ${name}.`,
      );
      if (name !== "OpenAI")
        expect(JSON.stringify(policy.disclosure)).not.toContain("OpenAI");
    },
  );

  it("serves the runtime model's disclosure from the preset session", async () => {
    const harness = createPluginHarness<WebChatInterface>();
    const shell = harness.getMockShell();
    const appInfo = shell.getAppInfo.bind(shell);
    spyOn(shell, "getAppInfo").mockImplementation(async () => ({
      ...(await appInfo()),
      ai: {
        model: "claude-sonnet-5",
        embeddingModel: "text-embedding-3-small",
      },
    }));
    const plugin = new WebChatInterface(
      { guest: "local-test" },
      { guestHttp: { ready: (): boolean => true } },
    );
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
      expect(response.status).toBe(200);
      const session: unknown = await response.json();
      expect(session).toMatchObject({
        provider: "Anthropic (claude-sonnet-5)",
        notice: expect.stringContaining("reach this Brain and Anthropic."),
      });
      expect(JSON.stringify(session)).not.toContain("OpenAI");
    } finally {
      await harness.reset();
    }
  });

  it("declares a configured preset's guest routes before registration", () => {
    const paths = (plugin: WebChatInterface): string[] =>
      plugin.getWebRoutes().map((route) => route.path);
    expect(paths(new WebChatInterface({ guest: "local-test" }))).toEqual(
      expect.arrayContaining(["/ask/assets/guest.js", "/ask/authenticated"]),
    );
    expect(paths(new WebChatInterface())).not.toContain("/ask/assets/guest.js");
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
