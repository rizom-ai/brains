import { describe, it, expect } from "bun:test";
import type { Plugin } from "@brains/plugins";
import {
  ATPROTO_BRAIN_CARD_CONFLICT,
  ATPROTO_BRAIN_CARD_DISCOVERED,
  ATPROTO_BRAIN_CARD_REFRESHED,
  ATPROTO_BRAIN_CARD_UNAVAILABLE,
  ATPROTO_BRAIN_DISCOVERED,
} from "@brains/atproto-contracts";
import { createPluginHarness } from "@brains/plugins/test";
import type { FetchFn } from "../src/lib/fetch-agent-card";
import {
  installAgentDiscovery,
  testBrainCardPayload,
  useNetwork,
} from "./fixtures/agent-network";
import { createTestAgent } from "./fixtures/agent";
import type { AgentEntity } from "../src/schemas/agent";

describe("what a brain card does to the directory", () => {
  it("creates a discovered agent from an ATProto brain card event", async () => {
    const harness = createPluginHarness<Plugin>({});
    const events: unknown[] = [];

    harness.subscribe(ATPROTO_BRAIN_DISCOVERED, async (message) => {
      events.push(message.payload);
      return { success: true };
    });

    await installAgentDiscovery(harness);
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

  it("refreshes remote card fields without overwriting local relationship notes", async () => {
    const harness = createPluginHarness<Plugin>({});

    await installAgentDiscovery(harness);
    await harness.getEntityService().createEntity({
      entity: createTestAgent({
        id: "peer.example.com",
        name: "Old cached owner",
        brainName: "Old cached brain",
        url: "https://peer.example.com/a2a",
        status: "approved",
        notes: "Local trust note. Do not overwrite.",
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
    expect(agent?.metadata.name).toBe("Peer Owner");
    expect(agent?.metadata.cardCid).toBe("bafy-peer-card");
    expect(agent?.metadata.cardObservedAt).toBe("2026-06-02T12:30:00.000Z");
    expect(agent?.metadata.cardLastCheckedAt).toBeDefined();
    expect(agent?.metadata.cardLastError).toBeUndefined();
    expect(agent?.content).toContain("name: Peer Owner");
    expect(agent?.content).toContain("brainName: Peer Brain");
    expect(agent?.content).toContain("Local trust note. Do not overwrite.");

    harness.reset();
  });

  it("enriches an approved agent from an ATProto brain card without downgrading it", async () => {
    const harness = createPluginHarness<Plugin>({});
    const events: unknown[] = [];

    harness.subscribe(ATPROTO_BRAIN_CARD_REFRESHED, async (message) => {
      events.push(message.payload);
      return { success: true };
    });

    await installAgentDiscovery(harness);
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

  it("fails closed when a different repo DID claims an existing agent domain", async () => {
    const harness = createPluginHarness<Plugin>({});
    const conflicts: unknown[] = [];
    harness.subscribe(ATPROTO_BRAIN_CARD_CONFLICT, async (message) => {
      conflicts.push(message.payload);
      return { success: true };
    });
    await installAgentDiscovery(harness);
    await harness.sendMessage(
      ATPROTO_BRAIN_CARD_DISCOVERED,
      testBrainCardPayload,
      "atproto",
    );

    const before = await harness.getEntityService().getEntity<AgentEntity>({
      entityType: "agent",
      id: "peer.example.com",
    });
    expect(before).toBeDefined();
    if (!before) throw new Error("Expected discovered agent");
    await harness.getEntityService().updateEntity({
      entity: {
        ...before,
        content: before.content.replace(
          "status: discovered",
          "status: approved",
        ),
        metadata: { ...before.metadata, status: "approved" },
      },
    });

    await harness.sendMessage(
      ATPROTO_BRAIN_CARD_DISCOVERED,
      {
        ...testBrainCardPayload,
        repoDid: "did:plc:attacker",
        uri: "at://did:plc:attacker/ai.rizom.brain.card/self",
        cid: "bafy-attacker-card",
      },
      "atproto",
    );

    const after = await harness.getEntityService().getEntity<AgentEntity>({
      entityType: "agent",
      id: "peer.example.com",
    });
    expect(after?.metadata.status).toBe("approved");
    expect(after?.metadata.repoDid).toBe("did:plc:peer");
    expect(after?.metadata.cardCid).toBe("bafy-peer-card");
    expect(conflicts).toEqual([
      expect.objectContaining({
        domain: "peer.example.com",
        existingRepoDid: "did:plc:peer",
        candidateRepoDid: "did:plc:attacker",
      }),
    ]);

    harness.reset();
  });

  it("marks a deleted remote card unavailable without revoking approval", async () => {
    const harness = createPluginHarness<Plugin>({});
    await installAgentDiscovery(harness);
    await harness.sendMessage(
      ATPROTO_BRAIN_CARD_DISCOVERED,
      testBrainCardPayload,
      "atproto",
    );

    const before = await harness.getEntityService().getEntity<AgentEntity>({
      entityType: "agent",
      id: "peer.example.com",
    });
    expect(before).toBeDefined();
    if (!before) throw new Error("Expected discovered agent");
    await harness.getEntityService().updateEntity({
      entity: {
        ...before,
        content: before.content.replace(
          "status: discovered",
          "status: approved",
        ),
        metadata: { ...before.metadata, status: "approved" },
      },
    });

    await harness.sendMessage(
      ATPROTO_BRAIN_CARD_UNAVAILABLE,
      {
        repoDid: "did:plc:peer",
        observedAt: "2026-07-22T13:00:00.000Z",
        staleAfter: "2026-07-23T13:00:00.000Z",
        reason: "deleted",
      },
      "atproto",
    );

    const after = await harness.getEntityService().getEntity<AgentEntity>({
      entityType: "agent",
      id: "peer.example.com",
    });
    expect(after?.metadata.status).toBe("approved");
    expect(after?.metadata.cardUnavailableAt).toBe("2026-07-22T13:00:00.000Z");
    expect(after?.metadata.cardLastError).toContain("deleted");
    expect(after?.metadata.cardStaleAfter).toBe("2026-07-23T13:00:00.000Z");

    harness.reset();
  });

  it("archives an expired never-approved unavailable candidate", async () => {
    const harness = createPluginHarness<Plugin>({});
    const shell = harness.getMockShell();
    let run:
      ((context: { signal: AbortSignal }) => Promise<unknown>) | undefined;
    shell.getRecurringChecks = (): ReturnType<
      typeof shell.getRecurringChecks
    > => ({
      register: (check): (() => void) => {
        if (check.id.endsWith("agent-card-refresh")) run = check.run;
        return () => {};
      },
    });
    const unavailableFetch: FetchFn = async () =>
      new Response("unavailable", { status: 503 });
    useNetwork(unavailableFetch);
    await installAgentDiscovery(harness);
    await harness.sendMessage(
      ATPROTO_BRAIN_CARD_DISCOVERED,
      testBrainCardPayload,
      "atproto",
    );
    await harness.sendMessage(
      ATPROTO_BRAIN_CARD_UNAVAILABLE,
      {
        repoDid: "did:plc:peer",
        observedAt: "2026-07-21T13:00:00.000Z",
        staleAfter: "2026-07-22T13:00:00.000Z",
        reason: "deleted",
      },
      "atproto",
    );

    await run?.({ signal: new AbortController().signal });

    const expired = await harness.getEntityService().getEntity<AgentEntity>({
      entityType: "agent",
      id: "peer.example.com",
    });
    expect(expired?.metadata.status).toBe("archived");
    expect(expired?.metadata.cardCid).toBe("bafy-peer-card");
    harness.reset();
  });
});
