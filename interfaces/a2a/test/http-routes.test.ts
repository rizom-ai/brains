import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { FetchFn } from "../src/client";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AuthService,
  authServicePlugin,
  getActiveAuthService,
} from "@brains/auth-service";
import type { AgentResponse } from "@brains/plugins";
import { keyFingerprint, signRequest } from "@brains/http-signatures";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { PermissionService } from "@brains/plugins";
import {
  A2A_PLUGIN_ID,
  CALL_TOOL,
  installA2A,
  instantiate,
  type InstalledA2A,
} from "./helpers/install";

describe("A2A HTTP routes", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  const tempDirs: string[] = [];

  beforeEach(() => {
    harness = createPluginHarness({
      logger: createSilentLogger("a2a-test"),
    });
  });

  afterEach(async () => {
    await harness.getMockShell().getDaemonRegistry().stopPlugin(A2A_PLUGIN_ID);
    await harness.getMockShell().getDaemonRegistry().stopPlugin("auth-service");
    await harness.reset();
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
    options: {
      bodyOverride?: string;
      signingUrl?: string;
      requestUrl?: string;
      headers?: Record<string, string>;
    } = {},
  ): Promise<Request> {
    const bodyText = JSON.stringify(body);
    const headers = new Headers({
      "Content-Type": "application/json",
      ...options.headers,
    });
    const signingKey = await signer.getA2ASigningKey();
    const signingUrl = options.signingUrl ?? "http://brain/a2a";
    await signRequest(
      {
        method: "POST",
        url: signingUrl,
        headers,
        body: bodyText,
      },
      signingKey.privateJwk,
      signingKey.keyId,
    );

    return new Request(options.requestUrl ?? signingUrl, {
      method: "POST",
      headers,
      body: options.bodyOverride ?? bodyText,
    });
  }

  function a2aPostRoute(a2a: InstalledA2A): ReturnType<InstalledA2A["route"]> {
    return a2a.route("/a2a", "POST");
  }

  it("rejects legacy bearer-token trust config", () => {
    const legacyConfig = {
      inbound: true,
      trustedTokens: { token: "remote.example" },
    };

    // The strict config schema refuses the key the class used to name.
    expect(() => instantiate(legacyConfig)).toThrow(/Invalid plugin config/);
  });

  it("returns a helpful 405 for GET /a2a", async () => {
    const a2a = await installA2A(harness, { inbound: true });

    const route = a2a
      .routes()
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
      "Content-Type, Signature, Signature-Input, Content-Digest, Date",
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const body = await response.json();
    expect(body).toEqual({
      error: "Use POST with JSON-RPC 2.0 requests.",
      agentCard: "/.well-known/agent-card.json",
    });
  });

  it("registers in outbound-only mode by default", async () => {
    const a2a = await installA2A(harness);
    const capabilities = a2a.capabilities;

    expect(capabilities.tools.map((tool) => tool.name)).toContain(CALL_TOOL);
    expect(a2a.routes()).toEqual([]);
  });

  it("aborts active turns when the A2A daemon stops", async () => {
    let receivedSignal: AbortSignal | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const response: AgentResponse = {
      text: "unused",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
    const agentService = {
      chat: async (
        _message: string,
        _conversationId: string,
        _context?: unknown,
        signal?: AbortSignal,
      ): Promise<AgentResponse> => {
        receivedSignal = signal;
        markStarted?.();
        return new Promise<AgentResponse>(() => {});
      },
      confirmPendingAction: async (): Promise<AgentResponse> => response,
      invalidateAgent: (): void => {},
    };
    harness.getMockShell().setAgentService(agentService);

    const a2a = await installA2A(harness, { inbound: true });
    const daemons = harness.getMockShell().getDaemonRegistry();
    await daemons.startPlugin(A2A_PLUGIN_ID);

    const route = a2aPostRoute(a2a);
    const httpResponse = await route.handler(
      new Request("http://brain/a2a", {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "message/send",
          params: {
            message: {
              kind: "message",
              messageId: "shutdown-test",
              role: "user",
              parts: [{ kind: "text", text: "Hello" }],
            },
          },
        }),
      }),
    );
    expect(httpResponse.status).toBe(200);
    await started;

    await daemons.stopPlugin(A2A_PLUGIN_ID);
    expect(receivedSignal?.aborted).toBe(true);
  });

  it("exposes shared-host routes for agent card and a2a", async () => {
    const a2a = await installA2A(harness, { inbound: true });

    const routes = a2a.routes();
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
    const fetchFn: FetchFn = async (input, init) => {
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
    };

    const { capabilities } = await installA2A(
      harness,
      { inbound: true },
      { fetch: fetchFn },
    );
    const tool = capabilities.tools.find(
      (candidate) => candidate.name === CALL_TOOL,
    );
    if (!tool) throw new Error("Expected a2a_call tool");

    const result = await tool.handler(
      { agent: "remote.example.com", message: "hello" },
      {
        interfaceType: "test",
        actor: { kind: "user", userId: "test" },
      },
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

  it("leaves outbound requests unsigned when the auth issuer is local", async () => {
    await harness.installPlugin(
      authServicePlugin({
        storageDir: await tempStorageDir(),
        issuer: "http://localhost:8080",
      }),
    );
    const capturedHeaders: Record<string, string>[] = [];
    const fetchFn: FetchFn = async (input, init) => {
      const url = String(input);
      if (url.includes(".well-known/agent-card.json")) {
        return Response.json({
          name: "Remote",
          url: "https://remote.example.com/a2a",
        });
      }

      const headers = Object.fromEntries(new Headers(init?.headers));
      capturedHeaders.push(headers);
      if (headers["signature"]) {
        return new Response("Invalid HTTP signature", { status: 401 });
      }

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
    };

    const { capabilities } = await installA2A(
      harness,
      { inbound: true },
      { fetch: fetchFn },
    );
    const tool = capabilities.tools.find(
      (candidate) => candidate.name === CALL_TOOL,
    );
    if (!tool) throw new Error("Expected a2a_call tool");

    const result = await tool.handler(
      { agent: "remote.example.com", message: "hello" },
      {
        interfaceType: "test",
        actor: { kind: "user", userId: "test" },
      },
    );

    expect(result).toHaveProperty("success", true);
    expect(capturedHeaders).toHaveLength(1);
    expect(capturedHeaders[0]?.["signature"]).toBeUndefined();
    expect(capturedHeaders[0]?.["signature-input"]).toBeUndefined();
  });

  it("verifies reverse-proxied signed requests against the external URL", async () => {
    await harness.installPlugin(
      authServicePlugin({
        storageDir: await tempStorageDir(),
        issuer: "https://local.example",
      }),
    );

    let capturedLevel = "";
    let capturedIsAnchor: boolean | undefined;
    harness.setPermissionService(
      new PermissionService({ anchors: ["a2a:remote.example"] }),
    );
    harness.setAgentService({
      chat: async (_message, _conversationId, context) => {
        capturedLevel = context?.userPermissionLevel ?? "public";
        capturedIsAnchor = context?.isAnchor;
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
    const remotePublicKey = remoteJwks.keys.find((key) => key.alg === "EdDSA");
    if (!remotePublicKey) {
      throw new Error("Expected remote A2A public key");
    }
    const localAuth = getActiveAuthService();
    if (!localAuth) {
      throw new Error("Expected active auth service");
    }
    await localAuth.grantA2APeerTrust({
      domain: "remote.example",
      keyFingerprint: keyFingerprint(remotePublicKey),
      grantedLevel: "trusted",
    });

    const a2a = await installA2A(
      harness,
      { inbound: true },
      { fetch: async (): Promise<Response> => Response.json(remoteJwks) },
    );
    const response = await a2aPostRoute(a2a).handler(
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
        {
          signingUrl: "https://brain.example.com/a2a",
          requestUrl: "http://localhost:8080/a2a",
          headers: {
            host: "brain.example.com",
            "x-forwarded-proto": "https",
          },
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(capturedLevel).toBe("trusted");
    expect(capturedIsAnchor).toBe(true);
  });

  it("rejects signed inbound requests with a bad digest", async () => {
    const remoteAuth = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://remote.example",
    });
    const remoteJwks = await remoteAuth.getJwks();
    const a2a = await installA2A(
      harness,
      { inbound: true },
      { fetch: async (): Promise<Response> => Response.json(remoteJwks) },
    );

    const response = await a2aPostRoute(a2a).handler(
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
    const a2a = await installA2A(harness, { inbound: true });

    const route = a2a
      .routes()
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
