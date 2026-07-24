import { describe, expect, it, mock } from "bun:test";
import { createServicePluginContext } from "@brains/plugins";
import { createMockShell } from "@brains/test-utils";
import {
  ATPROTO_BRAIN_CARD_DISCOVERED,
  type AtprotoBrainCardRecord,
} from "@brains/atproto-contracts";
import {
  AtprotoPlugin,
  atprotoPlugin,
  plugin,
  type AtprotoPdsClientLike,
} from "../src";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createResolverFetch(): (
  input: string | URL | Request,
) => Promise<Response> {
  return mock(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("com.atproto.identity.resolveHandle")) {
      return jsonResponse({ did: "did:plc:test" });
    }
    if (url === "https://plc.directory/did%3Aplc%3Atest") {
      return jsonResponse({
        service: [
          {
            id: "#atproto_pds",
            type: "AtprotoPersonalDataServer",
            serviceEndpoint: "https://resolved-pds.example.com",
          },
        ],
      });
    }
    if (url === "https://test.example.com/.well-known/did.json") {
      return jsonResponse({
        id: "did:web:test.example.com",
        alsoKnownAs: ["at://did:plc:test"],
      });
    }
    return jsonResponse({ message: "Not found" }, 404);
  });
}

function createTestBrainCardRecord(): AtprotoBrainCardRecord {
  return {
    $type: "ai.rizom.brain.card",
    siteUrl: "https://test.example.com",
    brain: {
      did: "did:web:test.example.com",
      name: "Rizom Test Brain",
      role: "assistant",
      purpose: "A test brain",
      values: ["helpful"],
    },
    anchor: {
      did: "did:plc:test-anchor",
      name: "Rizom",
      kind: "collective",
    },
    model: "test-brain",
    version: "0.2.0-test",
    skills: [
      {
        id: "research",
        name: "Research",
        description: "Research topics for collaborators.",
        tags: ["research"],
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("atproto plugin", () => {
  it("exports a conventional external plugin factory", () => {
    expect(plugin).toBe(atprotoPlugin);
  });

  it("validates configuration", () => {
    expect(() => atprotoPlugin({ pdsEndpoint: "not-a-url" })).toThrowError();
  });

  it("exposes conventional did:web routes when enabled", () => {
    const plugin = atprotoPlugin();

    expect(
      plugin
        .getWebRoutes()
        .map((route) => route.path)
        .sort(),
    ).toEqual(["/.well-known/did.json", "/anchor/did.json"]);
  });

  it("serves the handle-verification DID when an account DID is configured", async () => {
    // Member handles under the fleet domain (docs/plans/
    // atproto-integration.md): the brain self-verifies its owner atproto
    // handle by serving the account DID at /.well-known/atproto-did — the
    // HTTP verification method, no per-user DNS records.
    const plugin = atprotoPlugin({
      accountDid: "did:plc:oehciuqunzskplljt3qnnncw",
    });

    const route = plugin
      .getWebRoutes()
      .find((entry) => entry.path === "/.well-known/atproto-did");
    expect(route?.method).toBe("GET");
    expect(route?.public).toBe(true);

    const response = await route?.handler(
      new Request("https://rizom.ai/.well-known/atproto-did"),
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get("Content-Type")).toBe("text/plain");
    expect(await response?.text()).toBe("did:plc:oehciuqunzskplljt3qnnncw");
  });

  it("does not serve atproto-did without an account DID", () => {
    const plugin = atprotoPlugin();
    expect(
      plugin
        .getWebRoutes()
        .some((entry) => entry.path === "/.well-known/atproto-did"),
    ).toBe(false);
  });

  it("serves conventional did:web document routes when DIDs are omitted", async () => {
    const plugin = atprotoPlugin({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
    });

    const routes = plugin.getWebRoutes();
    expect(routes.map((route) => route.path).sort()).toEqual([
      "/.well-known/did.json",
      "/anchor/did.json",
    ]);

    const brainRoute = routes.find(
      (route) => route.path === "/.well-known/did.json",
    );
    const brainResponse = await brainRoute?.handler(
      new Request("https://brain.example.com/.well-known/did.json"),
    );
    expect(await brainResponse?.json()).toMatchObject({
      id: "did:web:brain.example.com",
      alsoKnownAs: ["at://brain.example.com"],
      service: [
        {
          id: "#atproto_pds",
          type: "AtprotoPersonalDataServer",
          serviceEndpoint: "https://pds.example.com",
        },
      ],
    });

    const anchorRoute = routes.find(
      (route) => route.path === "/anchor/did.json",
    );
    const anchorResponse = await anchorRoute?.handler(
      new Request("https://brain.example.com/anchor/did.json"),
    );
    expect(await anchorResponse?.json()).toEqual({
      "@context": ["https://www.w3.org/ns/did/v1"],
      id: "did:web:brain.example.com:anchor",
    });
  });

  it("serves did:web document routes when configured", async () => {
    const plugin = atprotoPlugin({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      brainDid: "did:web:brain.example.com",
      anchorDid: "did:web:brain.example.com:anchor",
    });

    const routes = plugin.getWebRoutes();
    expect(routes.map((route) => route.path).sort()).toEqual([
      "/.well-known/did.json",
      "/anchor/did.json",
    ]);
    expect(routes.every((route) => route.method === "GET")).toBe(true);
    expect(routes.every((route) => route.public)).toBe(true);

    const brainRoute = routes.find(
      (route) => route.path === "/.well-known/did.json",
    );
    const brainResponse = await brainRoute?.handler(
      new Request("https://brain.example.com/.well-known/did.json"),
    );
    expect(brainResponse?.status).toBe(200);
    expect(brainResponse?.headers.get("content-type")).toBe(
      "application/did+json",
    );

    const brainBody = (await brainResponse?.json()) as {
      id: string;
      service: Array<{ serviceEndpoint: string }>;
    };
    expect(brainBody.id).toBe("did:web:brain.example.com");
    expect(brainBody.service[0]?.serviceEndpoint).toBe(
      "https://pds.example.com",
    );

    const anchorRoute = routes.find(
      (route) => route.path === "/anchor/did.json",
    );
    const anchorResponse = await anchorRoute?.handler(
      new Request("https://brain.example.com/anchor/did.json"),
    );
    expect(anchorResponse?.status).toBe(200);
    expect(await anchorResponse?.json()).toEqual({
      "@context": ["https://www.w3.org/ns/did/v1"],
      id: "did:web:brain.example.com:anchor",
    });
  });

  it("hides routes when disabled", () => {
    const plugin = atprotoPlugin({
      enabled: false,
      brainDid: "did:web:brain.example.com",
    });

    expect(plugin.getWebRoutes()).toEqual([]);
  });

  it("does not expose AT Protocol operations as agent tools or instructions", async () => {
    const plugin = atprotoPlugin({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      brainDid: "did:web:brain.example.com",
    });

    const capabilities = await plugin.register(createMockShell());

    expect(capabilities.tools).toEqual([]);
    expect(capabilities.instructions).toBeUndefined();
  });

  it("reports invalid credentials without throwing", async () => {
    const plugin = new AtprotoPlugin(
      {
        pdsEndpoint: "https://pds.example.com",
        identifier: "brain.example.com",
        appPassword: "bad-secret",
      },
      {
        createPdsClient: (): AtprotoPdsClientLike => ({
          createSession: mock(async () => {
            throw new Error("Invalid identifier or password");
          }),
          createRecord: mock(async () => ({
            uri: "at://repo/record",
            cid: "cid",
          })),
        }),
      },
    );

    await plugin.register(createMockShell());

    expect(await plugin.validatePdsCredentials()).toBe(false);
  });

  it("discovers a valid brain card and emits a discovery event", async () => {
    const cardRecord = createTestBrainCardRecord();
    const getRecord = mock(async () => ({
      uri: "at://did:plc:test/ai.rizom.brain.card/self",
      cid: "bafytestcard",
      value: cardRecord,
    }));
    const pdsEndpoints: string[] = [];
    const plugin = new AtprotoPlugin(
      {
        pdsEndpoint: "https://pds.example.com",
      },
      {
        fetch: createResolverFetch(),
        resolveHostname: async (): Promise<string[]> => ["93.184.216.34"],
        createPdsClient: ({ pdsEndpoint }): AtprotoPdsClientLike => {
          pdsEndpoints.push(pdsEndpoint);
          return {
            createSession: mock(async () => ({
              did: "did:plc:unused",
              handle: "unused.example.com",
              accessJwt: "access-token",
              refreshJwt: "refresh-token",
            })),
            createRecord: mock(async () => ({
              uri: "at://repo/record",
              cid: "cid",
            })),
            getRecord,
          };
        },
      },
    );
    const shell = createMockShell();
    const events: unknown[] = [];
    shell
      .getMessageBus()
      .subscribe(ATPROTO_BRAIN_CARD_DISCOVERED, (message) => {
        events.push(message.payload);
        return { success: true };
      });

    await plugin.register(shell);
    const response = await plugin.discoverBrainCards(
      createServicePluginContext(shell, "atproto"),
      { repos: ["test.example.com"] },
    );

    expect(response).toMatchObject({
      discovered: 1,
      results: [
        {
          repo: "test.example.com",
          status: "discovered",
          repoDid: "did:plc:test",
          uri: "at://did:plc:test/ai.rizom.brain.card/self",
          cid: "bafytestcard",
        },
      ],
    });
    expect(events).toEqual([
      {
        repoDid: "did:plc:test",
        uri: "at://did:plc:test/ai.rizom.brain.card/self",
        cid: "bafytestcard",
        record: cardRecord,
      },
    ]);
    expect(pdsEndpoints).toEqual(["https://resolved-pds.example.com"]);
    expect(getRecord).toHaveBeenCalledWith({
      repo: "did:plc:test",
      collection: "ai.rizom.brain.card",
      rkey: "self",
    });
  });

  it("converts cross-version anchor kinds on discovered cards", async () => {
    const cardRecord = {
      ...createTestBrainCardRecord(),
      anchor: {
        did: "did:plc:test-anchor",
        name: "Future Peer",
        kind: "organization",
      },
    };
    const plugin = new AtprotoPlugin(
      { pdsEndpoint: "https://pds.example.com" },
      {
        fetch: createResolverFetch(),
        resolveHostname: async (): Promise<string[]> => ["93.184.216.34"],
        createPdsClient: (): AtprotoPdsClientLike => ({
          createSession: mock(async () => ({
            did: "did:plc:unused",
            handle: "unused.example.com",
            accessJwt: "access-token",
            refreshJwt: "refresh-token",
          })),
          createRecord: mock(async () => ({
            uri: "at://repo/record",
            cid: "cid",
          })),
          getRecord: mock(async () => ({
            uri: "at://did:plc:test/ai.rizom.brain.card/self",
            cid: "bafytestcard",
            value: cardRecord,
          })),
        }),
      },
    );
    const shell = createMockShell();
    const events: unknown[] = [];
    shell
      .getMessageBus()
      .subscribe(ATPROTO_BRAIN_CARD_DISCOVERED, (message) => {
        events.push(message.payload);
        return { success: true };
      });

    await plugin.register(shell);
    const response = await plugin.discoverBrainCards(
      createServicePluginContext(shell, "atproto"),
      { repos: ["test.example.com"] },
    );

    expect(response.discovered).toBe(1);
    expect(events).toEqual([
      expect.objectContaining({
        record: expect.objectContaining({
          anchor: expect.objectContaining({
            name: "Future Peer",
            kind: "collective",
          }),
        }),
      }),
    ]);
  });

  it("skips invalid brain cards without emitting discovery events", async () => {
    const getRecord = mock(async () => ({
      uri: "at://did:plc:test/ai.rizom.brain.card/self",
      cid: "bafytestcard",
      value: {
        $type: "ai.rizom.brain.card",
        description: "missing required name and createdAt",
      },
    }));
    const plugin = new AtprotoPlugin(
      { pdsEndpoint: "https://pds.example.com" },
      {
        fetch: createResolverFetch(),
        resolveHostname: async (): Promise<string[]> => ["93.184.216.34"],
        createPdsClient: (): AtprotoPdsClientLike => ({
          createSession: mock(async () => ({
            did: "did:plc:unused",
            handle: "unused.example.com",
            accessJwt: "access-token",
            refreshJwt: "refresh-token",
          })),
          createRecord: mock(async () => ({
            uri: "at://repo/record",
            cid: "cid",
          })),
          getRecord,
        }),
      },
    );
    const shell = createMockShell();
    const events: unknown[] = [];
    shell
      .getMessageBus()
      .subscribe(ATPROTO_BRAIN_CARD_DISCOVERED, (message) => {
        events.push(message.payload);
        return { success: true };
      });

    await plugin.register(shell);
    const response = await plugin.discoverBrainCards(
      createServicePluginContext(shell, "atproto"),
      { repos: ["test.example.com"] },
    );

    expect(response).toMatchObject({
      discovered: 0,
      skipped: 1,
      results: [{ status: "skipped" }],
    });
    expect(events).toEqual([]);
  });

  it("skips unresolved repo DIDs instead of falling back to the configured PDS", async () => {
    const getRecord = mock(async () => ({
      uri: "at://did:plc:missing/ai.rizom.brain.card/self",
      cid: "bafytestcard",
      value: createTestBrainCardRecord(),
    }));
    const createPdsClient = mock((): AtprotoPdsClientLike => ({
      createSession: mock(async () => ({
        did: "did:plc:unused",
        handle: "unused.example.com",
        accessJwt: "access-token",
        refreshJwt: "refresh-token",
      })),
      createRecord: mock(async () => ({
        uri: "at://repo/record",
        cid: "cid",
      })),
      getRecord,
    }));
    const plugin = new AtprotoPlugin(
      { pdsEndpoint: "https://fallback-pds.example.com" },
      {
        fetch: mock(async () => jsonResponse({ message: "Not found" }, 404)),
        createPdsClient,
      },
    );
    const shell = createMockShell();
    await plugin.register(shell);

    const response = await plugin.discoverBrainCards(
      createServicePluginContext(shell, "atproto"),
      { repos: ["did:plc:missing"] },
    );

    expect(response).toMatchObject({
      discovered: 0,
      skipped: 1,
      results: [
        {
          repo: "did:plc:missing",
          status: "skipped",
          error: expect.stringContaining("Could not resolve AT Protocol PDS"),
        },
      ],
    });
    expect(createPdsClient).not.toHaveBeenCalled();
    expect(getRecord).not.toHaveBeenCalled();
  });

  it("does not expose credential validation as an agent tool", async () => {
    const createSession = mock(async () => ({
      did: "did:plc:repo",
      handle: "brain.example.com",
      accessJwt: "access-token",
      refreshJwt: "refresh-token",
    }));
    const plugin = new AtprotoPlugin(
      {
        pdsEndpoint: "https://pds.example.com",
        identifier: "brain.example.com",
        appPassword: "secret",
      },
      {
        createPdsClient: (): AtprotoPdsClientLike => ({
          createSession,
          createRecord: mock(async () => ({
            uri: "at://repo/record",
            cid: "cid",
          })),
        }),
      },
    );

    const capabilities = await plugin.register(createMockShell());

    expect(capabilities.tools).toEqual([]);
    expect(await plugin.validatePdsCredentials()).toBe(true);
    expect(createSession).toHaveBeenCalledTimes(1);
  });
});
