import { describe, expect, it } from "bun:test";
import {
  a2aSharedEntityContract,
  a2aSharedEntityListContract,
} from "@brains/contracts";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import {
  createPluginHarness,
  expectConfirmation,
  expectSuccess,
} from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import { createTestAgent } from "./fixtures/agent";
import {
  agentDiscoveryPlugins,
  agentToolsPlugins,
  installAll,
  sharedCopyPlugins,
} from "./agent-discovery-plugins";

type Harness = ReturnType<typeof createPluginHarness<Plugin>>;

// A type the receiving brain has: a peer's document must fit its schema.
const note = defineEntity({
  type: "note",
  purpose: "A note.",
  metadata: z.object({ title: z.string() }),
});

const COPY_ID = "peer-example--note--pricing";

const attestation = {
  signedAt: "2026-11-26T08:00:00.000Z",
  keyId: "https://peer.example/.well-known/jwks.json#k1",
  signature: "c2lnbmVk",
};

function served(markdown: string, contentHash = "hash-1"): unknown {
  return {
    status: "found",
    entity: {
      entityType: "note",
      id: "pricing",
      markdown,
      contentHash,
      attestation,
    },
  };
}

/** Run the daily refresh, as the brain's scheduler does. */
async function refresh(harness: Harness): Promise<void> {
  const check = harness
    .getMockShell()
    .getRecurringCheck("shared-copies:refresh");
  if (!check) throw new Error("No refresh check");
  await check.run({ signal: new AbortController().signal });
}

const pricing = "---\ntitle: Pricing\n---\nWhat we charge.";

async function brain(
  answer: (request: { entityType: string; id: string }) => unknown,
  listing: () => unknown = () => ({ status: "not-found" }),
): Promise<{ harness: Harness; asked: unknown[] }> {
  const harness = createPluginHarness<Plugin>({});
  await installAll(
    harness,
    instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "notes", entities: [note] }),
      {},
      { name: "@fixture/notes", version: "0.0.0-test" },
      { pluginId: "notes" },
    ),
  );
  await installAll(harness, agentDiscoveryPlugins());
  await installAll(harness, sharedCopyPlugins());
  // Last, so the harness runs the tools of this one.
  await installAll(harness, agentToolsPlugins());
  const asked: unknown[] = [];
  harness.subscribe<{ agent: string; entityType: string; id: string }, unknown>(
    a2aSharedEntityContract.name,
    async (message) => {
      asked.push(message.payload);
      return { success: true, data: answer(message.payload) };
    },
  );
  harness.subscribe<{ agent: string }, unknown>(
    a2aSharedEntityListContract.name,
    async () => ({ success: true, data: listing() }),
  );
  return { harness, asked };
}

function confirmationArgs(confirmation: unknown): Record<string, unknown> {
  const args: unknown = Reflect.get(Object(confirmation), "args");
  if (typeof args !== "object" || args === null) {
    throw new Error("Expected confirmation args");
  }
  return { ...args };
}

async function copies(harness: Harness): Promise<
  Array<{
    id: string;
    visibility: string;
    content: string;
    metadata: Record<string, unknown>;
  }>
> {
  return (
    await harness.getEntityService().listEntities({
      entityType: "shared-copy",
      options: { filter: { visibilityScope: "restricted" } },
    })
  ).map(({ id, visibility, content, metadata }) => ({
    id,
    visibility,
    content,
    metadata,
  }));
}

async function take(
  harness: Harness,
  id = "pricing",
): ReturnType<Harness["executeTool"]> {
  const confirmation = await harness.executeTool("agent_shared_entities", {
    agent: "peer.example",
    action: "take",
    entityType: "note",
    id,
  });
  expectConfirmation(confirmation);
  return harness.executeTool(
    "agent_shared_entities",
    confirmationArgs(confirmation),
  );
}

describe("taking a copy of what a peer shares", () => {
  it("asks first, and stores nothing until confirmed", async () => {
    const { harness } = await brain(() => served(pricing));

    const confirmation = await harness.executeTool("agent_shared_entities", {
      agent: "peer.example",
      action: "take",
      entityType: "note",
      id: "pricing",
    });

    expectConfirmation(confirmation);
    expect(confirmation.summary).toBe(
      'Take a read-only copy of note "pricing" from peer.example?',
    );
    expect(await copies(harness)).toEqual([]);
    await harness.reset();
  });

  it("stores the entity as a shared copy, apart from this brain's own notes", async () => {
    const { harness } = await brain(() => served(pricing));

    const result = await take(harness);

    expectSuccess(result);
    expect(result.data).toMatchObject({
      copyId: COPY_ID,
      agent: "peer.example",
      entityType: "note",
      id: "pricing",
      title: "Pricing",
    });
    expect(await copies(harness)).toEqual([
      {
        id: COPY_ID,
        // The peer shared it with this brain: its trusted users, never the public.
        visibility: "shared",
        content: "What we charge.",
        metadata: {
          title: "Pricing",
          sourceBrain: "peer.example",
          sourceEntityType: "note",
          sourceEntityId: "pricing",
          sourceState: "active",
          sourceContentHash: "hash-1",
          receivedAt: expect.any(String),
          // The owner's signature over the hash, verified on receipt.
          sourceSignedAt: attestation.signedAt,
          sourceKeyId: attestation.keyId,
          sourceSignature: attestation.signature,
          sourceHeader: "title: Pricing",
        },
      },
    ]);
    // None of it became a note of this brain's own.
    expect(
      await harness.getEntityService().listEntities({
        entityType: "note",
        options: { filter: { visibilityScope: "restricted" } },
      }),
    ).toEqual([]);
    await harness.reset();
  });

  it("refuses a document that does not fit this brain's schema for its type", async () => {
    const { harness } = await brain(() =>
      served("---\nheading: No title here\n---\nBody."),
    );

    // Refused when first asked: there is nothing to confirm.
    const result = await harness.executeTool("agent_shared_entities", {
      agent: "peer.example",
      action: "take",
      entityType: "note",
      id: "pricing",
    });

    expect(result).toMatchObject({ success: false, code: "invalid_entity" });
    expect(await copies(harness)).toEqual([]);
    await harness.reset();
  });

  it("refuses a type this brain does not have", async () => {
    const { harness } = await brain(() => ({
      status: "found",
      entity: {
        entityType: "gadget",
        id: "pricing",
        markdown: pricing,
        contentHash: "h",
        attestation,
      },
    }));

    const confirmation = await harness.executeTool("agent_shared_entities", {
      agent: "peer.example",
      action: "take",
      entityType: "gadget",
      id: "pricing",
    });

    expect(confirmation).toMatchObject({
      success: false,
      code: "unknown_type",
    });
    expect(await copies(harness)).toEqual([]);
    await harness.reset();
  });

  it("takes the same entity again into the same copy", async () => {
    let text = pricing;
    const { harness } = await brain(() =>
      served(text, `hash-of-${text.length}`),
    );
    await take(harness);
    text = "---\ntitle: Pricing 2027\n---\nWhat we charge next year.";

    expectSuccess(await take(harness));

    expect(await copies(harness)).toEqual([
      expect.objectContaining({
        id: COPY_ID,
        content: "What we charge next year.",
        metadata: expect.objectContaining({ title: "Pricing 2027" }),
      }),
    ]);
    await harness.reset();
  });

  it("stores nothing when the peer shares no such entity", async () => {
    const { harness } = await brain(() => ({ status: "not-found" }));

    const confirmation = await harness.executeTool("agent_shared_entities", {
      agent: "peer.example",
      action: "take",
      entityType: "note",
      id: "pricing",
    });

    expect(confirmation).toMatchObject({ success: false, code: "not_found" });
    expect(await copies(harness)).toEqual([]);
    await harness.reset();
  });
});

describe("listing what a peer offers", () => {
  const offered = {
    status: "found",
    entities: [
      { entityType: "note", id: "pricing", title: "Pricing" },
      { entityType: "note", id: "roadmap", title: "Roadmap" },
    ],
  };

  it("names each entity the peer shares, and which this brain holds a copy of", async () => {
    const { harness } = await brain(
      () => served(pricing),
      () => offered,
    );
    await take(harness);

    const result = await harness.executeTool("agent_shared_entities", {
      agent: "peer.example",
      action: "list",
    });

    expectSuccess(result);
    expect(result.data).toEqual({
      agent: "peer.example",
      entities: [
        { entityType: "note", id: "pricing", title: "Pricing", copied: true },
        { entityType: "note", id: "roadmap", title: "Roadmap", copied: false },
      ],
    });
    await harness.reset();
  });

  it("says so when the peer shares nothing with this brain", async () => {
    const { harness } = await brain(() => served(pricing));

    const result = await harness.executeTool("agent_shared_entities", {
      agent: "peer.example",
      action: "list",
    });

    expect(result).toMatchObject({ success: false, code: "not_found" });
    await harness.reset();
  });
});

describe("dropping a copy", () => {
  it("removes it once confirmed", async () => {
    const { harness } = await brain(() => served(pricing));
    await take(harness);

    const confirmation = await harness.executeTool("agent_shared_entities", {
      agent: "peer.example",
      action: "drop",
      entityType: "note",
      id: "pricing",
    });
    expectConfirmation(confirmation);
    expect(confirmation.summary).toBe(
      'Drop the copy of note "pricing" from peer.example?',
    );
    expect(await copies(harness)).toHaveLength(1);

    expectSuccess(
      await harness.executeTool(
        "agent_shared_entities",
        confirmationArgs(confirmation),
      ),
    );
    expect(await copies(harness)).toEqual([]);
    await harness.reset();
  });

  it("says so when there is no such copy", async () => {
    const { harness } = await brain(() => served(pricing));

    const result = await harness.executeTool("agent_shared_entities", {
      agent: "peer.example",
      action: "drop",
      entityType: "note",
      id: "pricing",
    });

    expect(result).toMatchObject({ success: false, code: "no_copy" });
    await harness.reset();
  });
});

describe("keeping a copy current", () => {
  it("takes the owner's new text on the daily refresh, unasked", async () => {
    let answer = served(pricing);
    const { harness, asked } = await brain(() => answer);
    await take(harness);
    answer = served(
      "---\ntitle: Pricing 2027\n---\nWhat we charge next year.",
      "hash-2",
    );
    asked.length = 0;

    await refresh(harness);

    expect(asked).toEqual([
      { agent: "peer.example", entityType: "note", id: "pricing" },
    ]);
    expect(await copies(harness)).toEqual([
      expect.objectContaining({
        content: "What we charge next year.",
        metadata: expect.objectContaining({
          title: "Pricing 2027",
          sourceState: "active",
          sourceContentHash: "hash-2",
        }),
      }),
    ]);
    await harness.reset();
  });

  it("writes nothing when the owner's text has not changed", async () => {
    const { harness } = await brain(() => served(pricing));
    await take(harness);
    const [before] = await harness.getEntityService().listEntities({
      entityType: "shared-copy",
      options: { filter: { visibilityScope: "restricted" } },
    });

    await refresh(harness);

    const [after] = await harness.getEntityService().listEntities({
      entityType: "shared-copy",
      options: { filter: { visibilityScope: "restricted" } },
    });
    expect(after?.updated).toBe(before?.updated ?? "");
    await harness.reset();
  });

  it("erases the text and keeps a stub when the owner stops sharing", async () => {
    let answer = served(pricing);
    const { harness } = await brain(() => answer);
    await take(harness);
    answer = { status: "not-found" };

    await refresh(harness);

    expect(await copies(harness)).toEqual([
      {
        id: COPY_ID,
        visibility: "shared",
        // None of the owner's words are kept.
        content: "",
        metadata: {
          title: "Pricing",
          sourceBrain: "peer.example",
          sourceEntityType: "note",
          sourceEntityId: "pricing",
          sourceState: "withdrawn",
          // Still provable: the hash the owner signed, and its signature.
          sourceContentHash: "hash-1",
          sourceSignedAt: attestation.signedAt,
          sourceKeyId: attestation.keyId,
          sourceSignature: attestation.signature,
          receivedAt: expect.any(String),
          withdrawnAt: expect.any(String),
        },
      },
    ]);
    await harness.reset();
  });

  it("asks nothing more about a withdrawn copy", async () => {
    let answer = served(pricing);
    const { harness, asked } = await brain(() => answer);
    await take(harness);
    answer = { status: "not-found" };
    await refresh(harness);
    asked.length = 0;

    await refresh(harness);

    expect(asked).toEqual([]);
    await harness.reset();
  });

  for (const [why, unreachable] of [
    [
      "cannot be reached",
      { status: "refused", code: "peer_failed", error: "timeout" },
    ],
    [
      "serves something this brain cannot verify",
      { status: "refused", code: "unverified", error: "bad signature" },
    ],
  ] as const) {
    it(`changes nothing when the owner ${why}`, async () => {
      let answer = served(pricing);
      const { harness } = await brain(() => answer);
      await take(harness);
      const before = await copies(harness);
      answer = unreachable;

      await refresh(harness);

      expect(await copies(harness)).toEqual(before);
      await harness.reset();
    });
  }
});

describe("archiving a peer", () => {
  it("says how many copies it erases, and erases them down to stubs", async () => {
    const { harness } = await brain(() => served(pricing));
    await harness.getEntityService().createEntity({
      entity: createTestAgent({
        id: "peer.example",
        name: "Peer",
        url: "https://peer.example/a2a",
        status: "approved",
      }),
    });
    await take(harness);

    const confirmation = await harness.executeTool("agent_set_standing", {
      agent: "peer.example",
      contact: "archived",
    });
    expectConfirmation(confirmation);
    expect(confirmation.preview).toBe(
      "This brain will stop contacting peer.example, and its entry will be archived. The 1 copy this brain took from it is erased: its text is removed and a record that it existed is kept. Its inbound trust is not changed.",
    );
    expect(await copies(harness)).toEqual([
      expect.objectContaining({ content: "What we charge." }),
    ]);

    expectSuccess(
      await harness.executeTool(
        "agent_set_standing",
        confirmationArgs(confirmation),
      ),
    );

    expect(await copies(harness)).toEqual([
      expect.objectContaining({
        id: COPY_ID,
        content: "",
        metadata: expect.objectContaining({ sourceState: "withdrawn" }),
      }),
    ]);
    await harness.reset();
  });

  it("says nothing of copies when it took none", async () => {
    const { harness } = await brain(() => served(pricing));
    await harness.getEntityService().createEntity({
      entity: createTestAgent({
        id: "peer.example",
        name: "Peer",
        url: "https://peer.example/a2a",
        status: "approved",
      }),
    });

    const confirmation = await harness.executeTool("agent_set_standing", {
      agent: "peer.example",
      contact: "archived",
    });

    expectConfirmation(confirmation);
    expect(confirmation.preview).toBe(
      "This brain will stop contacting peer.example, and its entry will be archived. Its inbound trust is not changed.",
    );
    await harness.reset();
  });
});

describe("the shared-copy type", () => {
  it("never leaves the database, and nobody edits it by hand", async () => {
    const { harness } = await brain(() => served(pricing));

    const config = harness
      .getEntityRegistry()
      .getEntityTypeConfig("shared-copy");

    expect(config.contentRepo).toBe(false);
    expect(config.actionPolicy).toEqual({
      create: "never",
      update: "never",
      delete: "never",
      extract: "never",
      publish: "never",
    });
    await harness.reset();
  });
});
