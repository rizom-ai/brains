import { describe, expect, it, mock } from "bun:test";
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
    return jsonResponse({ message: "Not found" }, 404);
  });
}

function createTestBrainCardRecord(): AtprotoBrainCardRecord {
  return {
    $type: "ai.rizom.brain.card",
    name: "Rizom Test Brain",
    description: "A test brain",
    siteUrl: "https://test.example.com",
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
    brainDid: "did:web:test.example.com",
    anchorDid: "did:plc:test-anchor",
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

  it("exposes no did route without a did:web brain identity", () => {
    const plugin = atprotoPlugin();

    expect(plugin.getWebRoutes()).toEqual([]);
  });

  it("serves did:web document route when configured", async () => {
    const plugin = atprotoPlugin({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      brainDid: "did:web:brain.example.com",
    });

    const routes = plugin.getWebRoutes();
    expect(routes).toHaveLength(1);
    expect(routes[0]?.path).toBe("/.well-known/did.json");
    expect(routes[0]?.method).toBe("GET");
    expect(routes[0]?.public).toBe(true);

    const response = await routes[0]?.handler(
      new Request("https://brain.example.com/.well-known/did.json"),
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toBe("application/did+json");

    const body = (await response?.json()) as {
      id: string;
      service: Array<{ serviceEndpoint: string }>;
    };
    expect(body.id).toBe("did:web:brain.example.com");
    expect(body.service[0]?.serviceEndpoint).toBe("https://pds.example.com");
  });

  it("hides routes when disabled", () => {
    const plugin = atprotoPlugin({
      enabled: false,
      brainDid: "did:web:brain.example.com",
    });

    expect(plugin.getWebRoutes()).toEqual([]);
  });

  it("provides publishing instructions", async () => {
    const plugin = atprotoPlugin({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      brainDid: "did:web:brain.example.com",
    });

    const capabilities = await plugin.register(createMockShell());

    expect(capabilities.instructions).toContain("atproto_publish_card");
    expect(capabilities.instructions).toContain("atproto_publish_post");
    expect(capabilities.instructions).toContain("dryRun");
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

    const capabilities = await plugin.register(createMockShell());
    const tool = capabilities.tools.find(
      (candidate) => candidate.name === "atproto_validate_credentials",
    );

    expect(tool).toBeDefined();
    const response = await tool?.handler(
      {},
      { interfaceType: "test", userId: "test" },
    );
    expect(response).toEqual({ success: true, data: { valid: false } });
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

    const capabilities = await plugin.register(shell);
    const tool = capabilities.tools.find(
      (candidate) => candidate.name === "atproto_discover_brain_cards",
    );
    const response = await tool?.handler(
      { repos: ["test.example.com"] },
      { interfaceType: "test", userId: "test" },
    );

    if (!response || !("success" in response) || !response.success) {
      throw new Error("Expected discovery tool to succeed");
    }
    expect(response.data).toMatchObject({
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

    const capabilities = await plugin.register(shell);
    const tool = capabilities.tools.find(
      (candidate) => candidate.name === "atproto_discover_brain_cards",
    );
    const response = await tool?.handler(
      { repos: ["test.example.com"] },
      { interfaceType: "test", userId: "test" },
    );

    if (!response || !("success" in response) || !response.success) {
      throw new Error("Expected discovery tool to succeed");
    }
    expect(response.data).toMatchObject({
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
    const createPdsClient = mock(
      (): AtprotoPdsClientLike => ({
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
    );
    const plugin = new AtprotoPlugin(
      { pdsEndpoint: "https://fallback-pds.example.com" },
      {
        fetch: mock(async () => jsonResponse({ message: "Not found" }, 404)),
        createPdsClient,
      },
    );
    const capabilities = await plugin.register(createMockShell());
    const tool = capabilities.tools.find(
      (candidate) => candidate.name === "atproto_discover_brain_cards",
    );

    const response = await tool?.handler(
      { repos: ["did:plc:missing"] },
      { interfaceType: "test", userId: "test" },
    );

    if (!response || !("success" in response) || !response.success) {
      throw new Error("Expected discovery tool to succeed");
    }
    expect(response.data).toMatchObject({
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

  it("exposes a brain-card discovery tool", async () => {
    const getRecord = mock(async () => ({
      uri: "at://did:plc:test/ai.rizom.brain.card/self",
      cid: "bafytestcard",
      value: createTestBrainCardRecord(),
    }));
    const plugin = new AtprotoPlugin(
      { pdsEndpoint: "https://pds.example.com" },
      {
        fetch: createResolverFetch(),
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
    const capabilities = await plugin.register(createMockShell());
    const tool = capabilities.tools.find(
      (candidate) => candidate.name === "atproto_discover_brain_cards",
    );

    expect(tool).toBeDefined();
    const response = await tool?.handler(
      { repos: ["test.example.com"] },
      { interfaceType: "test", userId: "test" },
    );

    if (!response || !("success" in response) || !response.success) {
      throw new Error("Expected discovery tool to succeed");
    }
    expect(response.data).toMatchObject({ discovered: 1 });
  });

  it("exposes a credential validation tool", async () => {
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
    const tool = capabilities.tools.find(
      (candidate) => candidate.name === "atproto_validate_credentials",
    );

    expect(tool).toBeDefined();
    const response = await tool?.handler(
      {},
      { interfaceType: "test", userId: "test" },
    );
    expect(response).toEqual({ success: true, data: { valid: true } });
    expect(createSession).toHaveBeenCalledTimes(1);
  });
});
