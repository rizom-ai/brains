import { describe, expect, it, mock } from "bun:test";
import { createServicePluginContext, type BaseEntity } from "@brains/plugins";
import { createMockShell } from "@brains/test-utils";
import {
  ATPROTO_BRAIN_CARD_CONFLICT,
  ATPROTO_BRAIN_CARD_DISCOVERED,
  type AtprotoBrainCardRecord,
  type AtprotoPdsClientLike,
} from "@brains/atproto-contracts";
import { AtprotoPlugin } from "../src/plugin";

const repoDid = "did:plc:peer";

function card(
  overrides: Partial<AtprotoBrainCardRecord> = {},
): AtprotoBrainCardRecord {
  return {
    $type: "ai.rizom.brain.card",
    siteUrl: "https://peer.example.com",
    brain: {
      did: "did:web:peer.example.com",
      name: "Peer Brain",
      role: "assistant",
      purpose: "Safe peer discovery",
      values: ["collaboration"],
    },
    anchor: {
      did: "did:plc:anchor",
      name: "Peer Owner",
      kind: "professional",
    },
    model: "rover",
    version: "0.2.0-test",
    skills: [
      {
        id: "research",
        name: "Research",
        description: "Research collaborators",
        tags: ["research"],
      },
    ],
    createdAt: "2026-07-22T12:00:00.000Z",
    ...overrides,
  };
}

function identityFetch(
  pdsEndpoint = "https://pds.example.com",
): ReturnType<typeof mock> {
  return mock(async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    if (url === "https://plc.directory/did%3Aplc%3Apeer") {
      return Response.json({
        id: repoDid,
        service: [
          {
            id: "#atproto_pds",
            type: "AtprotoPersonalDataServer",
            serviceEndpoint: pdsEndpoint,
          },
        ],
      });
    }
    if (url === "https://peer.example.com/.well-known/did.json") {
      return Response.json({
        id: "did:web:peer.example.com",
        alsoKnownAs: [`at://${repoDid}`],
      });
    }
    return new Response("not found", { status: 404 });
  });
}

function publicResolver(): Promise<string[]> {
  return Promise.resolve(["93.184.216.34"]);
}

async function seedAgent(
  shell: ReturnType<typeof createMockShell>,
  input: {
    id: string;
    repoDid?: string;
    status: "discovered" | "approved";
  },
): Promise<void> {
  const now = "2026-07-22T11:00:00.000Z";
  const entity: BaseEntity = {
    id: input.id,
    entityType: "agent",
    content: "# Existing agent",
    metadata: {
      name: input.id,
      url: `https://${input.id}`,
      status: input.status,
      slug: input.id,
      ...(input.repoDid && { repoDid: input.repoDid }),
    },
    contentHash: "seed",
    visibility: "public",
    created: now,
    updated: now,
  };
  await shell.getEntityService().createEntity({ entity });
}

function pdsClient(
  input: {
    uri?: string;
    record?: AtprotoBrainCardRecord;
  } = {},
): AtprotoPdsClientLike {
  return {
    createSession: mock(async () => ({
      did: repoDid,
      handle: "peer.example.com",
      accessJwt: "unused",
      refreshJwt: "unused",
    })),
    createRecord: mock(async () => ({ uri: "at://unused", cid: "unused" })),
    getRecord: mock(async () => ({
      uri: input.uri ?? `at://${repoDid}/ai.rizom.brain.card/self`,
      cid: "bafy-card",
      value: input.record ?? card(),
    })),
  };
}

describe("ATProto authoritative discovery boundary", () => {
  it("refetches a bound card and emits only the authoritative snapshot", async () => {
    const createPdsClient = mock(() => pdsClient());
    const plugin = new AtprotoPlugin(
      {},
      {
        fetch: identityFetch(),
        resolveHostname: publicResolver,
        createPdsClient,
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

    const result = await plugin.discoverBrainCards(
      createServicePluginContext(shell, "atproto"),
      { repos: [repoDid] },
    );

    expect(result.discovered).toBe(1);
    expect(createPdsClient).toHaveBeenCalledWith(
      expect.objectContaining({ pdsEndpoint: "https://pds.example.com" }),
    );
    expect(events).toEqual([
      expect.objectContaining({
        repoDid,
        uri: `at://${repoDid}/ai.rizom.brain.card/self`,
        record: card(),
      }),
    ]);
  });

  it("rejects a returned AT URI for a different repo", async () => {
    const plugin = new AtprotoPlugin(
      {},
      {
        fetch: identityFetch(),
        resolveHostname: publicResolver,
        createPdsClient: (): AtprotoPdsClientLike =>
          pdsClient({
            uri: "at://did:plc:attacker/ai.rizom.brain.card/self",
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

    const result = await plugin.discoverBrainCards(
      createServicePluginContext(shell, "atproto"),
      { repos: [repoDid] },
    );

    expect(result.results[0]).toMatchObject({
      status: "skipped",
      retryable: false,
      error: expect.stringContaining("repo does not match"),
    });
    expect(events).toEqual([]);
  });

  it("rejects a card whose site and did:web domain are not bound", async () => {
    const plugin = new AtprotoPlugin(
      {},
      {
        fetch: identityFetch(),
        resolveHostname: publicResolver,
        createPdsClient: (): AtprotoPdsClientLike =>
          pdsClient({
            record: card({
              brain: {
                ...card().brain,
                did: "did:web:other.example.com",
              },
            }),
          }),
      },
    );
    const shell = createMockShell();
    await plugin.register(shell);

    const result = await plugin.discoverBrainCards(
      createServicePluginContext(shell, "atproto"),
      { repos: [repoDid] },
    );

    expect(result.results[0]).toMatchObject({
      status: "skipped",
      retryable: false,
      error: expect.stringContaining("did:web hostname"),
    });
  });

  it("applies domain and skill filters only after authoritative validation", async () => {
    const getRecord = mock(async () => ({
      uri: `at://${repoDid}/ai.rizom.brain.card/self`,
      cid: "bafy-card",
      value: card(),
    }));
    const client = pdsClient();
    client.getRecord = getRecord;
    const plugin = new AtprotoPlugin(
      {
        jetstream: {
          denyDomains: ["peer.example.com"],
          skillKeywords: ["design"],
        },
      },
      {
        fetch: identityFetch(),
        resolveHostname: publicResolver,
        createPdsClient: (): AtprotoPdsClientLike => client,
      },
    );
    const shell = createMockShell();
    await plugin.register(shell);

    const result = await plugin.discoverBrainCards(
      createServicePluginContext(shell, "atproto"),
      { repos: [repoDid] },
    );

    expect(getRecord).toHaveBeenCalledTimes(1);
    expect(result.results[0]).toMatchObject({
      status: "skipped",
      retryable: false,
      error: expect.stringContaining("denied domain"),
    });
  });

  it("enforces the pending ceiling and Jetstream creation admission gate", async () => {
    const shell = createMockShell();
    await seedAgent(shell, {
      id: "waiting.example.com",
      repoDid: "did:plc:waiting",
      status: "discovered",
    });
    const plugin = new AtprotoPlugin(
      { jetstream: { pendingCandidateCeiling: 1 } },
      {
        fetch: identityFetch(),
        resolveHostname: publicResolver,
        createPdsClient: (): AtprotoPdsClientLike => pdsClient(),
      },
    );
    await plugin.register(shell);

    const ceilingResult = await plugin.discoverBrainCards(
      createServicePluginContext(shell, "atproto"),
      { repos: [repoDid] },
    );
    expect(ceilingResult.results[0]).toMatchObject({
      status: "skipped",
      retryable: false,
      error: expect.stringContaining("pending-candidate ceiling"),
    });

    const emptyShell = createMockShell();
    const gatedPlugin = new AtprotoPlugin(
      {},
      {
        fetch: identityFetch(),
        resolveHostname: publicResolver,
        createPdsClient: (): AtprotoPdsClientLike => pdsClient(),
      },
    );
    await gatedPlugin.register(emptyShell);
    const gatedResult = await gatedPlugin.discoverBrainCards(
      createServicePluginContext(emptyShell, "atproto"),
      { repos: [repoDid], allowNewCandidates: false },
    );
    expect(gatedResult.results[0]).toMatchObject({
      status: "skipped",
      retryable: false,
      error: expect.stringContaining("creation rate cap"),
    });
  });

  it("allows same-repo refresh through a closed creation gate", async () => {
    const shell = createMockShell();
    await seedAgent(shell, {
      id: "peer.example.com",
      repoDid,
      status: "approved",
    });
    const plugin = new AtprotoPlugin(
      {},
      {
        fetch: identityFetch(),
        resolveHostname: publicResolver,
        createPdsClient: (): AtprotoPdsClientLike => pdsClient(),
      },
    );
    await plugin.register(shell);

    const result = await plugin.discoverBrainCards(
      createServicePluginContext(shell, "atproto"),
      { repos: [repoDid], allowNewCandidates: false },
    );

    expect(result.results[0]).toMatchObject({
      status: "discovered",
      created: false,
    });
  });

  it("emits a conflict instead of broadcasting a cross-repo domain claim", async () => {
    const shell = createMockShell();
    await seedAgent(shell, {
      id: "peer.example.com",
      repoDid: "did:plc:approved-owner",
      status: "approved",
    });
    const conflicts: unknown[] = [];
    const discovered: unknown[] = [];
    shell.getMessageBus().subscribe(ATPROTO_BRAIN_CARD_CONFLICT, (message) => {
      conflicts.push(message.payload);
      return { success: true };
    });
    shell
      .getMessageBus()
      .subscribe(ATPROTO_BRAIN_CARD_DISCOVERED, (message) => {
        discovered.push(message.payload);
        return { success: true };
      });
    const plugin = new AtprotoPlugin(
      {},
      {
        fetch: identityFetch(),
        resolveHostname: publicResolver,
        createPdsClient: (): AtprotoPdsClientLike => pdsClient(),
      },
    );
    await plugin.register(shell);

    const result = await plugin.discoverBrainCards(
      createServicePluginContext(shell, "atproto"),
      { repos: [repoDid] },
    );

    expect(result.results[0]).toMatchObject({
      status: "skipped",
      retryable: false,
      error: expect.stringContaining("identity collision"),
    });
    expect(discovered).toEqual([]);
    expect(conflicts).toEqual([
      expect.objectContaining({
        domain: "peer.example.com",
        existingRepoDid: "did:plc:approved-owner",
        candidateRepoDid: repoDid,
      }),
    ]);
  });

  it("caps the candidate-driven PLC response before PDS resolution", async () => {
    const createPdsClient = mock(() => pdsClient());
    const plugin = new AtprotoPlugin(
      { jetstream: { maxResponseBytes: 1024 } },
      {
        fetch: mock(async () =>
          Response.json({
            padding: "x".repeat(2048),
            service: [
              {
                id: "#atproto_pds",
                type: "AtprotoPersonalDataServer",
                serviceEndpoint: "https://pds.example.com",
              },
            ],
          }),
        ),
        resolveHostname: publicResolver,
        createPdsClient,
      },
    );
    const shell = createMockShell();
    await plugin.register(shell);

    const result = await plugin.discoverBrainCards(
      createServicePluginContext(shell, "atproto"),
      { repos: [repoDid] },
    );

    expect(result.results[0]).toMatchObject({
      status: "skipped",
      error: expect.stringContaining("exceeds 1024 bytes"),
    });
    expect(createPdsClient).not.toHaveBeenCalled();
  });

  it("classifies transient DNS failures for bounded retry", async () => {
    const plugin = new AtprotoPlugin(
      {},
      {
        fetch: identityFetch(),
        resolveHostname: (): Promise<string[]> =>
          Promise.reject(new Error("temporary DNS failure")),
        createPdsClient: (): AtprotoPdsClientLike => pdsClient(),
      },
    );
    const shell = createMockShell();
    await plugin.register(shell);

    const result = await plugin.discoverBrainCards(
      createServicePluginContext(shell, "atproto"),
      { repos: [repoDid] },
    );

    expect(result.results[0]).toMatchObject({
      status: "skipped",
      retryable: true,
      error: expect.stringContaining("temporary DNS failure"),
    });
  });

  it("rejects a private PDS endpoint before constructing a client", async () => {
    const createPdsClient = mock(() => pdsClient());
    const plugin = new AtprotoPlugin(
      {},
      {
        fetch: identityFetch("https://127.0.0.1:3000"),
        resolveHostname: publicResolver,
        createPdsClient,
      },
    );
    const shell = createMockShell();
    await plugin.register(shell);

    const result = await plugin.discoverBrainCards(
      createServicePluginContext(shell, "atproto"),
      { repos: [repoDid] },
    );

    expect(result.results[0]).toMatchObject({
      status: "skipped",
      retryable: false,
      error: expect.stringContaining("non-public"),
    });
    expect(createPdsClient).not.toHaveBeenCalled();
  });
});
