import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthService, authServicePlugin } from "@brains/auth-service";
import { signRequest } from "@brains/http-signatures";
import { createPluginHarness, PermissionService } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { A2AInterface } from "../src/a2a-interface";

describe("A2A HTTP routes", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  const originalFetch = globalThis.fetch;
  const tempDirs: string[] = [];

  function installWebserverPlugin(): void {
    harness.getMockShell().addPlugin({
      id: "webserver",
      version: "1.0.0",
      type: "interface",
      packageName: "@brains/webserver",
      register: async () => ({ tools: [], resources: [] }),
    });
  }

  beforeEach(() => {
    harness = createPluginHarness({
      logger: createSilentLogger("a2a-test"),
    });
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await harness.getMockShell().getDaemonRegistry().stopPlugin("a2a");
    await harness.getMockShell().getDaemonRegistry().stopPlugin("auth-service");
    await Promise.all(
      tempDirs
        .splice(0)
        .map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  async function tempStorageDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "brains-a2a-auth-"));
    tempDirs.push(dir);
    return dir;
  }

  async function signedA2ARequest(
    body: unknown,
    signer: AuthService,
    options: { bodyOverride?: string } = {},
  ): Promise<Request> {
    const bodyText = JSON.stringify(body);
    const headers = new Headers({ "Content-Type": "application/json" });
    const signingKey = await signer.getA2ASigningKey();
    await signRequest(
      {
        method: "POST",
        url: "http://brain/a2a",
        headers,
        body: bodyText,
      },
      signingKey.privateJwk,
      signingKey.keyId,
    );

    return new Request("http://brain/a2a", {
      method: "POST",
      headers,
      body: options.bodyOverride ?? bodyText,
    });
  }

  function a2aPostRoute(
    plugin: A2AInterface,
  ): ReturnType<A2AInterface["getWebRoutes"]>[number] {
    const route = plugin
      .getWebRoutes()
      .find(
        (candidate) => candidate.path === "/a2a" && candidate.method === "POST",
      );
    expect(route).toBeDefined();
    if (!route) {
      throw new Error("Expected A2A POST route");
    }
    return route;
  }

  it("returns a helpful 405 for GET /a2a", async () => {
    installWebserverPlugin();
    const plugin = new A2AInterface({ port: 0 });
    await harness.installPlugin(plugin);

    const route = plugin
      .getWebRoutes()
      .find(
        (candidate) => candidate.path === "/a2a" && candidate.method === "GET",
      );

    expect(route).toBeDefined();
    if (!route) {
      throw new Error("Expected A2A GET route");
    }

    const response = await route.handler(new Request("http://brain/a2a"));

    expect(response.status).toBe(405);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, OPTIONS",
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type, Authorization, Signature, Signature-Input, Content-Digest, Date",
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const body = await response.json();
    expect(body).toEqual({
      error: "Use POST with JSON-RPC 2.0 requests.",
      agentCard: "/.well-known/agent-card.json",
    });
  });

  it("registers without webserver in tool-only mode", async () => {
    const plugin = new A2AInterface({ port: 0 });

    const capabilities = await harness.installPlugin(plugin);

    expect(capabilities.tools.map((tool) => tool.name)).toContain("agent_call");
    expect(plugin.getWebRoutes()).toEqual([]);
  });

  it("exposes shared-host routes for agent card and a2a", async () => {
    installWebserverPlugin();
    const plugin = new A2AInterface({ port: 0 });
    await harness.installPlugin(plugin);

    const routes = plugin.getWebRoutes();
    expect(routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/.well-known/agent-card.json",
          method: "GET",
        }),
        expect.objectContaining({ path: "/a2a", method: "GET" }),
        expect.objectContaining({ path: "/a2a", method: "POST" }),
        expect.objectContaining({ path: "/a2a", method: "OPTIONS" }),
      ]),
    );
  });

  it("signs agent_call requests when auth service is active", async () => {
    await harness.installPlugin(
      authServicePlugin({
        storageDir: await tempStorageDir(),
        issuer: "https://local.example",
      }),
    );
    const capturedHeaders: Record<string, string>[] = [];
    globalThis.fetch = Object.assign(
      async (
        input: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        const url = String(input);
        if (url.includes(".well-known/agent-card.json")) {
          return new Response(
            JSON.stringify({
              name: "Remote",
              url: "https://remote.example.com/a2a",
            }),
          );
        }

        const headers: Record<string, string> = {};
        if (init?.headers instanceof Headers) {
          init.headers.forEach((value, key) => {
            headers[key] = value;
          });
        } else if (init?.headers) {
          Object.assign(headers, init.headers);
        }
        capturedHeaders.push(headers);

        return new Response(
          `data: ${JSON.stringify({
            result: {
              status: {
                state: "completed",
                message: { parts: [{ kind: "text", text: "ok" }] },
              },
              final: true,
            },
          })}\n\n`,
          { headers: { "Content-Type": "text/event-stream" } },
        );
      },
      { preconnect: originalFetch.preconnect },
    );

    const plugin = new A2AInterface({ port: 0 });
    const capabilities = await harness.installPlugin(plugin);
    const tool = capabilities.tools.find(
      (candidate) => candidate.name === "agent_call",
    );
    if (!tool) throw new Error("Expected agent_call tool");

    const result = await tool.handler(
      { agent: "remote.example.com", message: "hello" },
      { interfaceType: "test", userId: "test" },
    );

    expect(result).toHaveProperty("success", true);
    expect(capturedHeaders).toHaveLength(1);
    expect(capturedHeaders[0]?.["authorization"]).toBeUndefined();
    expect(capturedHeaders[0]?.["signature-input"]).toContain(
      'keyid="https://local.example/.well-known/jwks.json#',
    );
    expect(capturedHeaders[0]?.["signature"]).toStartWith("sig1=:");
    expect(capturedHeaders[0]?.["content-digest"]).toStartWith("sha-256=:");
  });

  it("verifies signed inbound requests and maps the caller domain to permissions", async () => {
    installWebserverPlugin();
    harness.setPermissionService(
      new PermissionService({ trusted: ["a2a:remote.example"] }),
    );

    let capturedLevel = "";
    harness.setAgentService({
      chat: async (_message, _conversationId, context) => {
        capturedLevel = context?.userPermissionLevel ?? "public";
        return {
          text: "ok",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      },
      confirmPendingAction: async () => ({
        text: "ok",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      }),
      invalidateAgent: () => {},
    });

    const remoteAuth = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://remote.example",
    });
    const remoteJwks = await remoteAuth.getJwks();
    globalThis.fetch = Object.assign(
      async (): Promise<Response> => Response.json(remoteJwks),
      { preconnect: originalFetch.preconnect },
    );

    const plugin = new A2AInterface({ port: 0 });
    await harness.installPlugin(plugin);
    const response = await a2aPostRoute(plugin).handler(
      await signedA2ARequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "message/send",
          params: {
            message: {
              kind: "message",
              messageId: "msg-1",
              role: "user",
              parts: [{ kind: "text", text: "hello" }],
            },
          },
        },
        remoteAuth,
      ),
    );

    expect(response.status).toBe(200);
    expect(capturedLevel).toBe("trusted");
  });

  it("rejects signed inbound requests with a bad digest", async () => {
    installWebserverPlugin();
    const remoteAuth = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://remote.example",
    });
    const remoteJwks = await remoteAuth.getJwks();
    globalThis.fetch = Object.assign(
      async (): Promise<Response> => Response.json(remoteJwks),
      { preconnect: originalFetch.preconnect },
    );

    const plugin = new A2AInterface({ port: 0 });
    await harness.installPlugin(plugin);

    const response = await a2aPostRoute(plugin).handler(
      await signedA2ARequest(
        { jsonrpc: "2.0", id: 1, method: "message/send", params: {} },
        remoteAuth,
        {
          bodyOverride: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "message/send",
            params: { tampered: true },
          }),
        },
      ),
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: "Invalid HTTP signature" });
  });

  it("adds cors headers to the agent card route", async () => {
    installWebserverPlugin();
    const plugin = new A2AInterface({ port: 0 });
    await harness.installPlugin(plugin);

    const route = plugin
      .getWebRoutes()
      .find(
        (candidate) =>
          candidate.path === "/.well-known/agent-card.json" &&
          candidate.method === "GET",
      );

    expect(route).toBeDefined();
    if (!route) {
      throw new Error("Expected A2A agent card route");
    }

    const response = await route.handler(
      new Request("http://brain/.well-known/agent-card.json"),
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
