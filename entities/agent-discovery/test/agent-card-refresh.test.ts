import { describe, it, expect } from "bun:test";
import type { Plugin } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { refreshKnownAgentCards } from "../src/lib/atproto-card-events";
import type { FetchFn } from "../src/lib/fetch-agent-card";
import {
  createMockPdsFetch,
  resolvePublicHostname,
  installAgentDiscovery,
  testBrainCardPayload,
  useNetwork,
  AGENT_PLUGIN_ID,
} from "./fixtures/agent-network";
import { createTestAgent } from "./fixtures/agent";

import { agentEntitySchema } from "../src/schemas/agent";

describe("known agent cards", () => {
  it("registers known-agent card refresh as a daily recurring check", async () => {
    const harness = createPluginHarness<Plugin>({});
    const shell = harness.getMockShell();
    let registered: { id: string; cadence: string } | undefined;
    shell.getRecurringChecks = (): ReturnType<
      typeof shell.getRecurringChecks
    > => ({
      register: (check): (() => void) => {
        registered = check;
        return () => {};
      },
    });

    await installAgentDiscovery(harness);

    expect(registered).toMatchObject({
      id: expect.stringContaining("agent-card-refresh"),
      cadence: "daily",
    });
    harness.reset();
  });

  it("refreshes known agent cards from the recurring check", async () => {
    const harness = createPluginHarness<Plugin>({});
    const updatedRecord = {
      ...testBrainCardPayload.record,
      brain: {
        ...testBrainCardPayload.record.brain,
        name: "Updated Peer Brain",
        purpose: "Updated remote purpose.",
      },
      anchor: {
        ...testBrainCardPayload.record.anchor,
        name: "Updated Peer Owner",
      },
      updatedAt: "2026-07-22T10:00:00.000Z",
    };
    const fetchMock = createMockPdsFetch({
      repoDid: testBrainCardPayload.repoDid,
      cid: "bafy-updated-card",
      record: updatedRecord,
    });

    useNetwork(fetchMock.fetch);
    await installAgentDiscovery(harness);
    await harness.getEntityService().createEntity({
      entity: createTestAgent({
        id: "peer.example.com",
        name: "Old cached owner",
        brainName: "Old cached brain",
        url: "https://peer.example.com/a2a",
        status: "approved",
        notes: "Local trust note.",
      }),
    });
    const staleAgent = await harness.getEntityService().getEntity(
      {
        entityType: "agent",
        id: "peer.example.com",
      },
      agentEntitySchema,
    );
    expect(staleAgent).not.toBeNull();
    if (!staleAgent) throw new Error("Expected stale agent fixture");
    await harness.getEntityService().updateEntity({
      entity: {
        ...staleAgent,
        metadata: {
          name: "Old cached owner",
          url: "https://peer.example.com/a2a",
          status: "approved",
          discoveredAt: "2026-03-31T00:00:00.000Z",
          slug: "peer-example-com",
          repoDid: testBrainCardPayload.repoDid,
          cardUri: testBrainCardPayload.uri,
          cardCid: "bafy-old-card",
        },
      },
    });

    await refreshKnownAgentCards(
      harness.getReactionContext(AGENT_PLUGIN_ID),
      undefined,
      new AbortController().signal,
      new Date().toISOString(),
      resolvePublicHostname,
    );

    const agent = await harness.getEntityService().getEntity(
      {
        entityType: "agent",
        id: "peer.example.com",
      },
      agentEntitySchema,
    );
    expect(agent?.metadata.status).toBe("approved");
    expect(agent?.metadata.name).toBe("Updated Peer Owner");
    expect(agent?.metadata.cardCid).toBe("bafy-updated-card");
    expect(agent?.metadata.cardObservedAt).toBe("2026-07-22T10:00:00.000Z");
    expect(agent?.content).toContain("Updated remote purpose.");
    expect(agent?.content).toContain("Local trust note.");
    expect(fetchMock.calls).toContain(
      `https://plc.directory/${testBrainCardPayload.repoDid}`,
    );
    harness.reset();
  });

  it("keeps unchanged cards from churning entity writes", async () => {
    const harness = createPluginHarness<Plugin>({});
    const fetchMock = createMockPdsFetch({
      repoDid: testBrainCardPayload.repoDid,
      cid: "bafy-peer-card",
      record: testBrainCardPayload.record,
    });
    const original = createTestAgent({
      id: "peer.example.com",
      name: "Peer Owner",
      brainName: "Peer Brain",
      url: "https://peer.example.com",
      status: "approved",
    });
    original.metadata = {
      ...original.metadata,
      repoDid: testBrainCardPayload.repoDid,
      cardUri: testBrainCardPayload.uri,
      cardCid: "bafy-peer-card",
    };
    original.updated = "2026-03-31T00:00:00.000Z";

    useNetwork(fetchMock.fetch);
    await installAgentDiscovery(harness);
    await harness.getEntityService().createEntity({ entity: original });

    await refreshKnownAgentCards(
      harness.getReactionContext(AGENT_PLUGIN_ID),
      undefined,
      new AbortController().signal,
      new Date().toISOString(),
      resolvePublicHostname,
    );

    const agent = await harness.getEntityService().getEntity(
      {
        entityType: "agent",
        id: "peer.example.com",
      },
      agentEntitySchema,
    );
    expect(agent?.updated).toBe("2026-03-31T00:00:00.000Z");
    expect(agent?.metadata.cardLastCheckedAt).toBeUndefined();
    harness.reset();
  });

  it("records refresh errors without dropping the last good snapshot", async () => {
    const harness = createPluginHarness<Plugin>({});
    const calls: string[] = [];
    const fetchMock: FetchFn = async (url: string | URL | Request) => {
      calls.push(typeof url === "string" ? url : url.toString());
      return new Response("unavailable", { status: 503 });
    };
    const original = createTestAgent({
      id: "peer.example.com",
      name: "Peer Owner",
      brainName: "Peer Brain",
      url: "https://peer.example.com/a2a",
      status: "approved",
      notes: "Local trust note.",
    });
    original.metadata = {
      ...original.metadata,
      repoDid: testBrainCardPayload.repoDid,
      cardUri: testBrainCardPayload.uri,
      cardCid: "bafy-last-good-card",
      cardObservedAt: "2026-06-02T12:30:00.000Z",
    };

    useNetwork(fetchMock);
    await installAgentDiscovery(harness);
    await harness.getEntityService().createEntity({ entity: original });

    await refreshKnownAgentCards(
      harness.getReactionContext(AGENT_PLUGIN_ID),
      undefined,
      new AbortController().signal,
      new Date().toISOString(),
      resolvePublicHostname,
    );

    const agent = await harness.getEntityService().getEntity(
      {
        entityType: "agent",
        id: "peer.example.com",
      },
      agentEntitySchema,
    );
    expect(agent?.metadata.cardCid).toBe("bafy-last-good-card");
    expect(agent?.metadata.cardObservedAt).toBe("2026-06-02T12:30:00.000Z");
    expect(agent?.metadata.cardLastCheckedAt).toBeDefined();
    expect(agent?.metadata.cardLastError).toContain("PLC lookup failed");
    expect(agent?.metadata.cardFailureCount).toBe(1);
    expect(agent?.metadata.cardUnavailableAt).toBeUndefined();
    expect(agent?.content).toContain("Local trust note.");
    expect(calls).toEqual([
      `https://plc.directory/${testBrainCardPayload.repoDid}`,
    ]);

    await refreshKnownAgentCards(
      harness.getReactionContext(AGENT_PLUGIN_ID),
      undefined,
      new AbortController().signal,
      new Date().toISOString(),
      resolvePublicHostname,
    );
    await refreshKnownAgentCards(
      harness.getReactionContext(AGENT_PLUGIN_ID),
      undefined,
      new AbortController().signal,
      new Date().toISOString(),
      resolvePublicHostname,
    );
    const repeatedlyUnavailable = await harness.getEntityService().getEntity(
      {
        entityType: "agent",
        id: "peer.example.com",
      },
      agentEntitySchema,
    );
    expect(repeatedlyUnavailable?.metadata.status).toBe("approved");
    expect(repeatedlyUnavailable?.metadata.cardFailureCount).toBe(3);
    expect(repeatedlyUnavailable?.metadata.cardUnavailableAt).toBeDefined();
    harness.reset();
  });

  it("rejects a private PDS endpoint during known-card refresh", async () => {
    const harness = createPluginHarness<Plugin>({});
    const calls: string[] = [];
    const hostileFetch: FetchFn = async (url) => {
      const value = url.toString();
      calls.push(value);
      if (value.startsWith("https://plc.directory/")) {
        return Response.json({
          service: [
            {
              id: "#atproto_pds",
              serviceEndpoint: "https://127.0.0.1:3000",
            },
          ],
        });
      }
      return Response.json({ message: "should not fetch" });
    };
    const original = createTestAgent({
      id: "peer.example.com",
      url: "https://peer.example.com",
      status: "approved",
    });
    original.metadata = {
      ...original.metadata,
      repoDid: testBrainCardPayload.repoDid,
      cardUri: testBrainCardPayload.uri,
      cardCid: testBrainCardPayload.cid,
    };

    useNetwork(hostileFetch);
    await installAgentDiscovery(harness);
    await harness.getEntityService().createEntity({ entity: original });
    await refreshKnownAgentCards(
      harness.getReactionContext(AGENT_PLUGIN_ID),
      undefined,
      new AbortController().signal,
      new Date().toISOString(),
      resolvePublicHostname,
    );

    const agent = await harness.getEntityService().getEntity(
      {
        entityType: "agent",
        id: "peer.example.com",
      },
      agentEntitySchema,
    );
    expect(calls).toEqual([
      `https://plc.directory/${testBrainCardPayload.repoDid}`,
    ]);
    expect(agent?.metadata.cardLastError).toContain("non-public");
    harness.reset();
  });

  it("clears unavailable state when the same card snapshot reappears", async () => {
    const harness = createPluginHarness<Plugin>({});
    const available = createMockPdsFetch({
      repoDid: testBrainCardPayload.repoDid,
      cid: testBrainCardPayload.cid,
      record: testBrainCardPayload.record,
    });
    let failing = true;
    const fetchMock: FetchFn = (url, init) =>
      failing
        ? Promise.resolve(new Response("unavailable", { status: 503 }))
        : available.fetch(url, init);
    const original = createTestAgent({
      id: "peer.example.com",
      name: "Peer Owner",
      brainName: "Peer Brain",
      url: "https://peer.example.com",
      status: "approved",
    });
    original.metadata = {
      ...original.metadata,
      repoDid: testBrainCardPayload.repoDid,
      cardUri: testBrainCardPayload.uri,
      cardCid: testBrainCardPayload.cid,
    };

    useNetwork(fetchMock);
    await installAgentDiscovery(harness);
    await harness.getEntityService().createEntity({ entity: original });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await refreshKnownAgentCards(
        harness.getReactionContext(AGENT_PLUGIN_ID),
        undefined,
        new AbortController().signal,
        new Date().toISOString(),
        resolvePublicHostname,
      );
    }
    failing = false;
    await refreshKnownAgentCards(
      harness.getReactionContext(AGENT_PLUGIN_ID),
      undefined,
      new AbortController().signal,
      new Date().toISOString(),
      resolvePublicHostname,
    );

    const recovered = await harness.getEntityService().getEntity(
      {
        entityType: "agent",
        id: "peer.example.com",
      },
      agentEntitySchema,
    );
    expect(recovered?.metadata.status).toBe("approved");
    expect(recovered?.metadata.cardCid).toBe(testBrainCardPayload.cid);
    expect(recovered?.metadata.cardFailureCount).toBeUndefined();
    expect(recovered?.metadata.cardUnavailableAt).toBeUndefined();
    expect(recovered?.metadata.cardLastError).toBeUndefined();
    harness.reset();
  });
});
