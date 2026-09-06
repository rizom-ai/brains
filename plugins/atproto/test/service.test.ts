import { createMockShell } from "@brains/plugins/test";
import { describe, expect, it, mock } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  ATPROTO_BRAIN_CARD_DISCOVERED,
  type AtprotoBrainCardRecord,
} from "@brains/atproto-contracts";
import {
  atprotoConfigSchema,
  atprotoService,
  type AtprotoPdsClientLike,
} from "../src";
import atprotoPackage from "../src";
import {
  ATPROTO_PLUGIN_ID,
  announcerFor,
  instantiate,
  publisherFor,
  routesFor,
} from "./helpers/install";

/**
 * What the service's own did.json routes must put on the wire. Parsing rather
 * than asserting means a document that stops carrying a service entry fails
 * here, instead of the endpoint assertion reading back `undefined`.
 */
const servedDidDocumentSchema = z.looseObject({
  id: z.string(),
  service: z.array(z.looseObject({ serviceEndpoint: z.string() })),
});

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
      category: "organization",
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

function unusedSession(): AtprotoPdsClientLike["createSession"] {
  return mock(async () => ({
    did: "did:plc:unused",
    handle: "unused.example.com",
    accessJwt: "access-token",
    refreshJwt: "refresh-token",
  }));
}

describe("atproto service", () => {
  it("is one declared service with the package's default collaborators", () => {
    expect(atprotoPackage.id).toBe("atproto");
    expect(atprotoService().id).toBe("atproto");
    expect(instantiate().id).toBe(ATPROTO_PLUGIN_ID);
  });

  it("validates configuration", () => {
    expect(() =>
      atprotoConfigSchema.parse({ pdsEndpoint: "not-a-url" }),
    ).toThrowError();
    expect(() => instantiate({ pdsEndpoint: "not-a-url" })).toThrowError();
  });

  it("exposes conventional did:web routes when enabled", () => {
    expect(
      routesFor()
        .map((route) => route.path)
        .sort(),
    ).toEqual(["/.well-known/did.json", "/anchor/did.json"]);
  });

  it("serves the handle-verification DID when an account DID is configured", async () => {
    // Member handles under the fleet domain (docs/plans/
    // atproto-integration.md): the brain self-verifies its owner atproto
    // handle by serving the account DID at /.well-known/atproto-did — the
    // HTTP verification method, no per-user DNS records.
    const route = routesFor({
      accountDid: "did:plc:oehciuqunzskplljt3qnnncw",
    }).find((entry) => entry.path === "/.well-known/atproto-did");
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
    expect(
      routesFor().some((entry) => entry.path === "/.well-known/atproto-did"),
    ).toBe(false);
  });

  it("serves conventional did:web document routes when DIDs are omitted", async () => {
    const routes = routesFor({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
    });
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
    const routes = routesFor({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      brainDid: "did:web:brain.example.com",
      anchorDid: "did:web:brain.example.com:anchor",
    });
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

    const brainBody = servedDidDocumentSchema.parse(
      await brainResponse?.json(),
    );
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
    expect(
      routesFor({ enabled: false, brainDid: "did:web:brain.example.com" }),
    ).toEqual([]);
  });

  it("does not expose AT Protocol operations as agent tools or instructions", async () => {
    const plugin = instantiate({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      brainDid: "did:web:brain.example.com",
    });

    const capabilities = await plugin.register(createMockShell());

    expect(capabilities.tools).toEqual([]);
    expect(capabilities.instructions).toBeUndefined();
  });

  it("listens to nothing when disabled", async () => {
    const shell = createMockShell();
    const createPdsClient = mock((): AtprotoPdsClientLike => ({
      createSession: unusedSession(),
      createRecord: mock(async () => ({ uri: "at://repo/record", cid: "cid" })),
    }));
    const plugin = instantiate(
      {
        enabled: false,
        identifier: "brain.example.com",
        appPassword: "secret",
        repoDid: "did:plc:repo",
      },
      { createPdsClient },
    );

    await plugin.register(shell);
    await shell.getMessageBus().send({
      type: "publish:completed",
      payload: { entityType: "note", entityId: "note-1" },
      sender: "publish-service",
      broadcast: true,
    });
    await plugin.shutdown?.();

    expect(createPdsClient).not.toHaveBeenCalled();
  });

  it("reports invalid credentials without throwing", async () => {
    const publisher = publisherFor(
      createMockShell(),
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

    expect(await publisher.validatePdsCredentials()).toBe(false);
  });

  it("validates credentials by opening one session", async () => {
    const createSession = mock(async () => ({
      did: "did:plc:repo",
      handle: "brain.example.com",
      accessJwt: "access-token",
      refreshJwt: "refresh-token",
    }));
    const publisher = publisherFor(
      createMockShell(),
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

    expect(await publisher.validatePdsCredentials()).toBe(true);
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it("discovers a valid brain card and announces it to every listener", async () => {
    const cardRecord = createTestBrainCardRecord();
    const getRecord = mock(async () => ({
      uri: "at://did:plc:test/ai.rizom.brain.card/self",
      cid: "bafytestcard",
      value: cardRecord,
    }));
    const pdsEndpoints: string[] = [];
    const shell = createMockShell();
    const events: unknown[] = [];
    for (const listener of ["first", "second"]) {
      shell
        .getMessageBus()
        .subscribe(ATPROTO_BRAIN_CARD_DISCOVERED, (message) => {
          events.push({ listener, payload: message.payload });
          return { success: true };
        });
    }
    const publisher = publisherFor(
      shell,
      { pdsEndpoint: "https://pds.example.com" },
      {
        fetch: createResolverFetch(),
        resolveHostname: async (): Promise<string[]> => ["93.184.216.34"],
        createPdsClient: ({ pdsEndpoint }): AtprotoPdsClientLike => {
          pdsEndpoints.push(pdsEndpoint);
          return {
            createSession: unusedSession(),
            createRecord: mock(async () => ({
              uri: "at://repo/record",
              cid: "cid",
            })),
            getRecord,
          };
        },
      },
    );

    const response = await publisher.discoverBrainCards(announcerFor(shell), {
      repos: ["test.example.com"],
    });

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
    const payload = {
      repoDid: "did:plc:test",
      uri: "at://did:plc:test/ai.rizom.brain.card/self",
      cid: "bafytestcard",
      record: cardRecord,
    };
    expect(events).toEqual([
      { listener: "first", payload },
      { listener: "second", payload },
    ]);
    expect(pdsEndpoints).toEqual(["https://resolved-pds.example.com"]);
    expect(getRecord).toHaveBeenCalledWith({
      repo: "did:plc:test",
      collection: "ai.rizom.brain.card",
      rkey: "self",
    });
  });

  it("rejects pre-cutover brain cards without a category", async () => {
    const cardRecord = {
      ...createTestBrainCardRecord(),
      anchor: {
        did: "did:plc:test-anchor",
        name: "Pre-cutover Peer",
        kind: "organization",
      },
    };
    const shell = createMockShell();
    const events: unknown[] = [];
    shell
      .getMessageBus()
      .subscribe(ATPROTO_BRAIN_CARD_DISCOVERED, (message) => {
        events.push(message.payload);
        return { success: true };
      });
    const publisher = publisherFor(
      shell,
      { pdsEndpoint: "https://pds.example.com" },
      {
        fetch: createResolverFetch(),
        resolveHostname: async (): Promise<string[]> => ["93.184.216.34"],
        createPdsClient: (): AtprotoPdsClientLike => ({
          createSession: unusedSession(),
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

    const response = await publisher.discoverBrainCards(announcerFor(shell), {
      repos: ["test.example.com"],
    });

    expect(response.discovered).toBe(0);
    expect(response.skipped).toBe(1);
    expect(events).toEqual([]);
  });

  it("skips invalid brain cards without announcing them", async () => {
    const getRecord = mock(async () => ({
      uri: "at://did:plc:test/ai.rizom.brain.card/self",
      cid: "bafytestcard",
      value: {
        $type: "ai.rizom.brain.card",
        description: "missing required name and createdAt",
      },
    }));
    const shell = createMockShell();
    const events: unknown[] = [];
    shell
      .getMessageBus()
      .subscribe(ATPROTO_BRAIN_CARD_DISCOVERED, (message) => {
        events.push(message.payload);
        return { success: true };
      });
    const publisher = publisherFor(
      shell,
      { pdsEndpoint: "https://pds.example.com" },
      {
        fetch: createResolverFetch(),
        resolveHostname: async (): Promise<string[]> => ["93.184.216.34"],
        createPdsClient: (): AtprotoPdsClientLike => ({
          createSession: unusedSession(),
          createRecord: mock(async () => ({
            uri: "at://repo/record",
            cid: "cid",
          })),
          getRecord,
        }),
      },
    );

    const response = await publisher.discoverBrainCards(announcerFor(shell), {
      repos: ["test.example.com"],
    });

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
      createSession: unusedSession(),
      createRecord: mock(async () => ({
        uri: "at://repo/record",
        cid: "cid",
      })),
      getRecord,
    }));
    const shell = createMockShell();
    const publisher = publisherFor(
      shell,
      { pdsEndpoint: "https://fallback-pds.example.com" },
      {
        fetch: mock(async () => jsonResponse({ message: "Not found" }, 404)),
        resolveHostname: async (): Promise<string[]> => ["93.184.216.34"],
        createPdsClient,
      },
    );

    const response = await publisher.discoverBrainCards(announcerFor(shell), {
      repos: ["did:plc:missing"],
    });

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
});
