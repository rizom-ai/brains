import { describe, expect, it } from "bun:test";
import { a2aSharedEntityContract } from "@brains/contracts";
import type { Plugin } from "@brains/plugins";
import { createPluginHarness, expectSuccess } from "@brains/plugins/test";
import {
  agentDiscoveryPlugins,
  agentToolsPlugins,
  installAll,
} from "./agent-discovery-plugins";

type Harness = ReturnType<typeof createPluginHarness<Plugin>>;

/** A brain whose A2A interface answers a shared-entity ask as `answer` says. */
async function brain(
  answer: (request: {
    agent: string;
    entityType: string;
    id: string;
  }) => unknown,
): Promise<{ harness: Harness; asked: unknown[] }> {
  const harness = createPluginHarness<Plugin>({});
  await installAll(harness, agentDiscoveryPlugins());
  await installAll(harness, agentToolsPlugins());
  const asked: unknown[] = [];
  harness.subscribe<{ agent: string; entityType: string; id: string }, unknown>(
    a2aSharedEntityContract.name,
    async (message) => {
      asked.push(message.payload);
      return { success: true, data: answer(message.payload) };
    },
  );
  return { harness, asked };
}

const pricing = {
  entityType: "note",
  id: "pricing",
  markdown: "---\ntitle: Pricing\n---\nWhat we charge.",
  contentHash: "hash-1",
  attestation: {
    signedAt: "2026-11-26T08:00:00.000Z",
    keyId: "https://peer.example/.well-known/jwks.json#k1",
    signature: "c2lnbmVk",
  },
};

describe("agent_shared_entities", () => {
  it("is an admin's tool that reaches outside the brain", async () => {
    const { harness } = await brain(() => ({ status: "not-found" }));

    const tool = harness
      .getCapabilities()
      .tools.find((candidate) => candidate.name === "agent_shared_entities");

    expect(tool?.visibility).toBe("admin");
    expect(tool?.sideEffects).toBe("external");
    await harness.reset();
  });

  it("shows a shared entity a peer serves, and stores nothing", async () => {
    const { harness, asked } = await brain(() => ({
      status: "found",
      entity: pricing,
    }));

    const result = await harness.executeTool("agent_shared_entities", {
      agent: "Peer.Example",
      action: "show",
      entityType: "note",
      id: "pricing",
    });

    expectSuccess(result);
    expect(result.data).toEqual({
      agent: "peer.example",
      entityType: "note",
      id: "pricing",
      markdown: "---\ntitle: Pricing\n---\nWhat we charge.",
    });
    expect(asked).toEqual([
      { agent: "peer.example", entityType: "note", id: "pricing" },
    ]);
    expect(
      await harness.getEntityService().listEntities({
        entityType: "note",
        options: { filter: { visibilityScope: "restricted" } },
      }),
    ).toEqual([]);
    await harness.reset();
  });

  it("says so when the peer shares no such entity with this brain", async () => {
    const { harness } = await brain(() => ({ status: "not-found" }));

    const result = await harness.executeTool("agent_shared_entities", {
      agent: "peer.example",
      action: "show",
      entityType: "note",
      id: "secret",
    });

    expect(result).toMatchObject({
      success: false,
      code: "not_found",
      error:
        'peer.example shares no note "secret" with this brain. It may not exist, or may not be shared with you.',
    });
    await harness.reset();
  });

  it("passes on why a peer was not asked", async () => {
    const { harness } = await brain(() => ({
      status: "refused",
      code: "agent_not_approved",
      error: "Agent peer.example is not approved yet. Approve it first.",
    }));

    const result = await harness.executeTool("agent_shared_entities", {
      agent: "peer.example",
      action: "show",
      entityType: "note",
      id: "pricing",
    });

    expect(result).toMatchObject({
      success: false,
      code: "agent_not_approved",
      error: "Agent peer.example is not approved yet. Approve it first.",
    });
    await harness.reset();
  });

  it("refuses to show without the entity's type and id", async () => {
    const { harness, asked } = await brain(() => ({ status: "not-found" }));

    const result = await harness.executeTool("agent_shared_entities", {
      agent: "peer.example",
      action: "show",
    });

    expect(result).toMatchObject({ success: false });
    expect(asked).toEqual([]);
    await harness.reset();
  });
});
