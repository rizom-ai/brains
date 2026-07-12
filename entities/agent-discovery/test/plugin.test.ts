import { afterEach, describe, it, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createPluginHarness,
  expectConfirmation,
  expectSuccess,
} from "@brains/plugins/test";
import {
  ATPROTO_BRAIN_CARD_DISCOVERED,
  ATPROTO_BRAIN_CARD_REFRESHED,
  ATPROTO_BRAIN_DISCOVERED,
} from "@brains/atproto-contracts";
import {
  AuthService,
  AuthServicePlugin,
  getActiveAuthService,
} from "@brains/auth-service";
import { keyFingerprint } from "@brains/http-signatures";
import type { Plugin } from "@brains/plugins";
import { AgentDiscoveryPlugin } from "../src/plugins/agent-plugin";
import { AgentToolsPlugin } from "../src/plugins/agent-tools-plugin";
import type { FetchFn } from "../src/lib/fetch-agent-card";
import type { AgentEntity, AgentStatus } from "../src/schemas/agent";
import { createTestAgent } from "./fixtures/agent";

function makeAgentEntity(status: AgentStatus): AgentEntity {
  return createTestAgent({
    id: "yeehaa.io",
    name: "Yeehaa",
    brainName: "Yeehaa",
    url: "https://yeehaa.io/a2a",
    status,
    about: "A saved agent.",
  });
}

function createAgentCard(domain: string): Record<string, unknown> {
  return {
    name: "Remote Brain",
    description: "A verified peer brain.",
    url: `https://${domain}/a2a`,
    skills: [
      {
        id: "research",
        name: "Research",
        description: "Research topics for collaborators.",
        tags: ["research"],
      },
    ],
  };
}

const tempDirs: string[] = [];

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-agent-discovery-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

function createMockAgentCardFetch(
  cards: Record<string, Record<string, unknown>>,
): { fetch: FetchFn; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fetch: async (url: string | URL | Request): Promise<Response> => {
      const urlString = typeof url === "string" ? url : url.toString();
      calls.push(urlString);
      const hostname = new URL(urlString).hostname;
      const card = cards[hostname];
      if (!card) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify(card), { status: 200 });
    },
  };
}

function createMockJwksFetch(jwksByDomain: Record<string, unknown>): {
  fetch: FetchFn;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    fetch: async (url: string | URL | Request): Promise<Response> => {
      const urlString = typeof url === "string" ? url : url.toString();
      calls.push(urlString);
      const hostname = new URL(urlString).hostname;
      const jwks = jwksByDomain[hostname];
      if (!jwks) return new Response("not found", { status: 404 });
      return Response.json(jwks);
    },
  };
}

const testBrainCardPayload = {
  repoDid: "did:plc:peer",
  uri: "at://did:plc:peer/ai.rizom.brain.card/self",
  cid: "bafy-peer-card",
  record: {
    $type: "ai.rizom.brain.card" as const,
    siteUrl: "https://peer.example.com",
    brain: {
      did: "did:web:peer.example.com",
      name: "Peer Brain",
      role: "assistant",
      purpose: "A peer brain discovered through ATProto.",
      values: ["collaboration"],
    },
    anchor: {
      did: "did:plc:anchor",
      name: "Peer Owner",
      kind: "professional",
    },
    model: "ranger",
    version: "0.2.0-test",
    skills: [
      {
        id: "research",
        name: "Research",
        description: "Research topics for collaborators.",
        tags: ["research"],
      },
    ],
    createdAt: "2026-06-02T12:00:00.000Z",
    updatedAt: "2026-06-02T12:30:00.000Z",
  },
};

describe("AgentDiscoveryPlugin", () => {
  it("should not auto-create agents from a2a call completion events", async () => {
    const harness = createPluginHarness<AgentDiscoveryPlugin>({});
    const plugin = new AgentDiscoveryPlugin();

    await harness.installPlugin(plugin);

    await harness.sendMessage(
      "a2a:call:completed",
      { domain: "yeehaa.io" },
      "a2a",
    );

    const agent = await harness.getEntityService().getEntity({
      entityType: "agent",
      id: "yeehaa.io",
    });
    expect(agent).toBeNull();

    harness.reset();
  });

  it("does not register system_create URL interception for agent contacts", async () => {
    const harness = createPluginHarness<AgentDiscoveryPlugin>({});
    const plugin = new AgentDiscoveryPlugin();

    await harness.installPlugin(plugin);

    expect(
      harness.getEntityRegistry().getCreateInterceptor("agent"),
    ).toBeUndefined();

    harness.reset();
  });

  it("registers agent_connect as the canonical confirmation-gated A2A verification tool", async () => {
    const harness = createPluginHarness<Plugin>({});
    const fetchMock = createMockAgentCardFetch({
      "connect-followup.example": createAgentCard("connect-followup.example"),
    });

    await harness.installPlugin(new AgentDiscoveryPlugin());
    await harness.installPlugin(new AgentToolsPlugin(fetchMock.fetch));

    const tool = harness
      .getCapabilities()
      .tools.find((candidate) => candidate.name === "agent_connect");
    expect(tool?.visibility).toBe("trusted");
    expect(tool?.sideEffects).toBe("external");
    expect(tool?.description).toContain("/.well-known/agent-card.json");
    expect(tool?.description).toContain(
      "Call this tool without confirmed on the initial request",
    );
    expect(tool?.description).not.toContain("prior conversation turn");

    const confirmation = await harness.executeTool("agent_connect", {
      source: { kind: "url", url: "connect-followup.example" },
    });

    expectConfirmation(confirmation);
    expect(confirmation.toolName).toBe("agent_connect");
    expect(confirmation.summary).toBe(
      "Verify and connect agent connect-followup.example?",
    );
    const confirmationArgs = confirmation.args as Record<string, unknown>;
    expect(confirmationArgs).toMatchObject({
      source: { kind: "url", url: "connect-followup.example" },
      confirmed: true,
    });
    expect(typeof confirmationArgs["confirmationToken"]).toBe("string");

    const result = await harness.executeTool("agent_connect", confirmationArgs);

    expectSuccess(result);
    expect(result.data).toMatchObject({
      status: "approved",
      entityId: "connect-followup.example",
      connected: true,
      created: true,
      a2aEndpoint: "https://connect-followup.example/a2a",
      skills: [
        {
          name: "Research",
          description: "Research topics for collaborators.",
          tags: ["research"],
        },
      ],
    });
    expect(fetchMock.calls).toEqual([
      "https://connect-followup.example/.well-known/agent-card.json",
    ]);

    const saved = await harness.getEntityService().getEntity<AgentEntity>({
      entityType: "agent",
      id: "connect-followup.example",
    });
    expect(saved?.metadata.status).toBe("approved");
    expect(saved?.metadata.a2aEndpoint).toBe(
      "https://connect-followup.example/a2a",
    );
    expect(saved?.content).toContain("Research");

    harness.reset();
  });

  it("registers agent_set_trust_level as the explicit inbound trust tool", async () => {
    const harness = createPluginHarness<Plugin>({});

    await harness.installPlugin(new AgentDiscoveryPlugin());
    await harness.installPlugin(new AgentToolsPlugin());

    const tool = harness
      .getCapabilities()
      .tools.find((candidate) => candidate.name === "agent_set_trust_level");
    expect(tool?.visibility).toBe("anchor");
    expect(tool?.sideEffects).toBe("external");
    expect(tool?.description).toContain("inbound A2A trust");
    expect(tool?.description).toContain("does not add or remove");

    harness.reset();
  });

  it("agent_set_trust_level pins a peer key for inbound trusted access", async () => {
    const harness = createPluginHarness<Plugin>({});
    const authPlugin = new AuthServicePlugin({
      storageDir: await tempStorageDir(),
      issuer: "https://local.example",
    });
    const remoteAuth = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://trust.example",
    });
    const remoteJwks = await remoteAuth.getJwks();
    const remoteA2AKey = remoteJwks.keys.find((key) => key.alg === "EdDSA");
    if (!remoteA2AKey) throw new Error("Expected remote A2A public key");
    const fetchMock = createMockJwksFetch({ "trust.example": remoteJwks });

    await harness.installPlugin(authPlugin);
    await harness.installPlugin(new AgentDiscoveryPlugin());
    await harness.installPlugin(new AgentToolsPlugin(fetchMock.fetch));
    await harness.getEntityService().createEntity({
      entity: createTestAgent({
        id: "trust.example",
        name: "Trusted Peer",
        url: "https://trust.example/a2a",
        status: "approved",
      }),
    });

    const confirmation = await harness.executeTool("agent_set_trust_level", {
      agent: "trust.example",
      level: "trusted",
    });
    expectConfirmation(confirmation);
    expect(confirmation.toolName).toBe("agent_set_trust_level");
    expect(confirmation.summary).toBe(
      "Grant inbound trusted A2A access to trust.example?",
    );
    expect(confirmation.preview).toContain(keyFingerprint(remoteA2AKey));

    const result = await harness.executeTool(
      "agent_set_trust_level",
      confirmation.args as Record<string, unknown>,
    );

    expectSuccess(result);
    expect(result.data).toMatchObject({
      agent: "trust.example",
      level: "trusted",
      keyFingerprint: keyFingerprint(remoteA2AKey),
    });
    const activeAuth = getActiveAuthService();
    if (!activeAuth) throw new Error("Expected active auth service");
    expect(await activeAuth.getA2APeerTrust("trust.example")).toMatchObject({
      domain: "trust.example",
      grantedLevel: "trusted",
      keyFingerprint: keyFingerprint(remoteA2AKey),
    });
    expect(fetchMock.calls).toEqual([
      "https://trust.example/.well-known/jwks.json",
    ]);

    if (authPlugin.shutdown) await authPlugin.shutdown();
    harness.reset();
  });

  it("agent_set_trust_level revokes inbound trusted access", async () => {
    const harness = createPluginHarness<Plugin>({});
    const authPlugin = new AuthServicePlugin({
      storageDir: await tempStorageDir(),
      issuer: "https://local.example",
    });

    await harness.installPlugin(authPlugin);
    await harness.installPlugin(new AgentDiscoveryPlugin());
    await harness.installPlugin(new AgentToolsPlugin());
    await harness.getEntityService().createEntity({
      entity: createTestAgent({
        id: "trust.example",
        name: "Trusted Peer",
        url: "https://trust.example/a2a",
        status: "approved",
      }),
    });
    const activeAuth = getActiveAuthService();
    if (!activeAuth) throw new Error("Expected active auth service");
    await activeAuth.grantA2APeerTrust({
      domain: "trust.example",
      keyFingerprint: "fingerprint-1",
      grantedLevel: "trusted",
    });

    const confirmation = await harness.executeTool("agent_set_trust_level", {
      agent: "trust.example",
      level: "public",
    });
    expectConfirmation(confirmation);
    expect(confirmation.summary).toBe(
      "Revoke inbound trusted A2A access from trust.example?",
    );

    const result = await harness.executeTool(
      "agent_set_trust_level",
      confirmation.args as Record<string, unknown>,
    );

    expectSuccess(result);
    expect(result.data).toMatchObject({
      agent: "trust.example",
      level: "public",
    });
    expect(await activeAuth.getA2APeerTrust("trust.example")).toBeUndefined();

    if (authPlugin.shutdown) await authPlugin.shutdown();
    harness.reset();
  });

  it("returns not_an_agent when agent_connect cannot verify an Agent Card", async () => {
    const harness = createPluginHarness<Plugin>({});
    const fetchMock = createMockAgentCardFetch({});

    await harness.installPlugin(new AgentDiscoveryPlugin());
    await harness.installPlugin(new AgentToolsPlugin(fetchMock.fetch));

    const confirmation = await harness.executeTool("agent_connect", {
      source: { kind: "url", url: "missing.example" },
    });
    expectConfirmation(confirmation);

    const result = await harness.executeTool(
      "agent_connect",
      confirmation.args as Record<string, unknown>,
    );

    expect(result).toEqual({
      success: false,
      error: "Could not verify an A2A Agent Card for missing.example.",
      code: "not_an_agent",
    });
    expect(
      await harness.getEntityService().getEntity({
        entityType: "agent",
        id: "missing.example",
      }),
    ).toBeNull();

    harness.reset();
  });

  it("rejects confirmed agent_connect args that do not match pending approval", async () => {
    const harness = createPluginHarness<Plugin>({});

    await harness.installPlugin(new AgentDiscoveryPlugin());
    await harness.installPlugin(new AgentToolsPlugin());

    const confirmation = await harness.executeTool("agent_connect", {
      source: { kind: "url", url: "connect-original.example" },
    });
    expectConfirmation(confirmation);

    const result = await harness.executeTool("agent_connect", {
      ...(confirmation.args as Record<string, unknown>),
      source: { kind: "url", url: "connect-changed.example" },
    });

    expect(result).toEqual({
      success: false,
      error:
        "Confirmed agent connection arguments do not match the pending approval. Please request connection again and confirm the new approval.",
    });

    harness.reset();
  });

  it("agent_connect approves an existing discovered agent", async () => {
    const harness = createPluginHarness<Plugin>({});
    const fetchMock = createMockAgentCardFetch({
      "yeehaa.io": createAgentCard("yeehaa.io"),
    });

    await harness.installPlugin(new AgentDiscoveryPlugin());
    await harness.installPlugin(new AgentToolsPlugin(fetchMock.fetch));
    await harness
      .getEntityService()
      .createEntity({ entity: makeAgentEntity("discovered") });

    const confirmation = await harness.executeTool("agent_connect", {
      source: { kind: "url", url: "https://yeehaa.io" },
    });
    expectConfirmation(confirmation);

    const result = await harness.executeTool(
      "agent_connect",
      confirmation.args as Record<string, unknown>,
    );

    expectSuccess(result);
    expect(result.data).toMatchObject({
      status: "approved",
      entityId: "yeehaa.io",
      connected: true,
      created: false,
    });

    const entities = await harness.getEntityService().listEntities({
      entityType: "agent",
    });
    expect(entities).toHaveLength(1);
    expect(entities[0]?.metadata["status"]).toBe("approved");
    expect(entities[0]?.content).toContain("status: approved");

    harness.reset();
  });

  it("agent_connect refreshes an existing approved agent without downgrading approval", async () => {
    const harness = createPluginHarness<Plugin>({});
    const fetchMock = createMockAgentCardFetch({
      "yeehaa.io": createAgentCard("yeehaa.io"),
    });

    await harness.installPlugin(new AgentDiscoveryPlugin());
    await harness.installPlugin(new AgentToolsPlugin(fetchMock.fetch));
    await harness
      .getEntityService()
      .createEntity({ entity: makeAgentEntity("approved") });

    const confirmation = await harness.executeTool("agent_connect", {
      source: { kind: "url", url: "https://yeehaa.io" },
    });
    expectConfirmation(confirmation);

    const result = await harness.executeTool(
      "agent_connect",
      confirmation.args as Record<string, unknown>,
    );

    expectSuccess(result);
    expect(result.data).toMatchObject({
      status: "approved",
      entityId: "yeehaa.io",
      connected: true,
      created: false,
    });

    const entities = await harness.getEntityService().listEntities({
      entityType: "agent",
    });
    expect(entities).toHaveLength(1);
    expect(entities[0]?.metadata["status"]).toBe("approved");

    harness.reset();
  });

  it("creates a discovered agent from an ATProto brain card event", async () => {
    const harness = createPluginHarness<AgentDiscoveryPlugin>({});
    const plugin = new AgentDiscoveryPlugin();
    const events: unknown[] = [];

    harness.subscribe(ATPROTO_BRAIN_DISCOVERED, async (message) => {
      events.push(message.payload);
      return { success: true };
    });

    await harness.installPlugin(plugin);
    await harness.sendMessage(
      ATPROTO_BRAIN_CARD_DISCOVERED,
      testBrainCardPayload,
      "atproto",
    );

    const agent = await harness.getEntityService().getEntity<AgentEntity>({
      entityType: "agent",
      id: "peer.example.com",
    });
    expect(agent?.metadata.status).toBe("discovered");
    expect(agent?.metadata.url).toBe("https://peer.example.com");
    expect(agent?.metadata.name).toBe("Peer Owner");
    expect(agent?.metadata.repoDid).toBe("did:plc:peer");
    expect(agent?.metadata.brainDid).toBe("did:web:peer.example.com");
    expect(agent?.metadata.anchorDid).toBe("did:plc:anchor");
    expect(agent?.metadata.cardUri).toBe(testBrainCardPayload.uri);
    expect(agent?.metadata.a2aEndpoint).toBeUndefined();
    expect(agent?.content).toContain("Research");
    expect(events).toEqual([
      expect.objectContaining({
        agentId: "peer.example.com",
        status: "discovered",
        brainDid: "did:web:peer.example.com",
        anchorDid: "did:plc:anchor",
        cardUri: testBrainCardPayload.uri,
      }),
    ]);

    harness.reset();
  });

  it("enriches an approved agent from an ATProto brain card without downgrading it", async () => {
    const harness = createPluginHarness<AgentDiscoveryPlugin>({});
    const plugin = new AgentDiscoveryPlugin();
    const events: unknown[] = [];

    harness.subscribe(ATPROTO_BRAIN_CARD_REFRESHED, async (message) => {
      events.push(message.payload);
      return { success: true };
    });

    await harness.installPlugin(plugin);
    await harness.getEntityService().createEntity({
      entity: createTestAgent({
        id: "peer.example.com",
        name: "Peer Brain",
        brainName: "Peer Brain",
        // Stored endpoint carries a path; enrichment must not overwrite it
        // with the card's bare siteUrl.
        url: "https://peer.example.com/a2a",
        status: "approved",
      }),
    });

    await harness.sendMessage(
      ATPROTO_BRAIN_CARD_DISCOVERED,
      testBrainCardPayload,
      "atproto",
    );

    const agent = await harness.getEntityService().getEntity<AgentEntity>({
      entityType: "agent",
      id: "peer.example.com",
    });
    expect(agent?.metadata.status).toBe("approved");
    expect(agent?.metadata.url).toBe("https://peer.example.com/a2a");
    expect(agent?.metadata.repoDid).toBe("did:plc:peer");
    expect(agent?.metadata.brainDid).toBe("did:web:peer.example.com");
    expect(agent?.metadata.anchorDid).toBe("did:plc:anchor");
    expect(agent?.metadata.cardCid).toBe("bafy-peer-card");
    // Body is refreshed from the signed card: the card's public skills and
    // purpose replace the stale generated body.
    expect(agent?.content).toContain("Research");
    expect(agent?.content).not.toContain("Content Creation");
    expect(agent?.content).toContain(
      "A peer brain discovered through ATProto.",
    );
    expect(events).toEqual([
      expect.objectContaining({
        agentId: "peer.example.com",
        status: "approved",
        brainDid: "did:web:peer.example.com",
        anchorDid: "did:plc:anchor",
        cardUri: testBrainCardPayload.uri,
      }),
    ]);

    harness.reset();
  });

  it("should register dashboard widgets on plugins ready", async () => {
    const harness = createPluginHarness<AgentDiscoveryPlugin>({});
    const plugin = new AgentDiscoveryPlugin();
    const registrations: Array<{
      id: string;
      group: string;
      rendererName: string;
      hasComponent: boolean;
      hasClientScript: boolean;
    }> = [];

    harness.subscribe("dashboard:register-widget", async (message) => {
      const payload = message.payload as {
        id: string;
        group: string;
        rendererName: string;
        component?: unknown;
        clientScript?: unknown;
      };
      registrations.push({
        id: payload.id,
        group: payload.group,
        rendererName: payload.rendererName,
        hasComponent: typeof payload.component === "function",
        hasClientScript: typeof payload.clientScript === "string",
      });
      return { success: true };
    });

    await harness.installPlugin(plugin);
    await harness.sendMessage("system:plugins:ready", {}, "shell");

    expect(registrations).toEqual([
      {
        id: "agent-network",
        group: "network",
        rendererName: "AgentNetworkWidget",
        hasComponent: true,
        hasClientScript: true,
      },
    ]);

    harness.reset();
  });
});
