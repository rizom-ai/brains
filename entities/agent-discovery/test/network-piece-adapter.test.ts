import { beforeEach, describe, expect, it } from "bun:test";
import { createMockShell } from "@brains/plugins/test";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import { defineEntityPackage } from "@brains/sdk/entities";
import { networkPiece } from "../src/network-piece-entity";
import { networkPieceId } from "../src/lib/network-piece-id";
async function install(): Promise<ReturnType<typeof createMockShell>> {
  const shell = createMockShell();
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "network", entities: [networkPiece] }),
    {},
    { name: "@brains/agent-discovery", version: "0.0.0-test" },
  ))
    await plugin.register(shell);
  return shell;
}
import type { NetworkPieceEntity } from "../src/schemas/network-piece";

// A network piece is another brain's published record, kept in Rizom's own
// brain for answering: public, searchable, cited to its brain, never
// re-published, and read-only.
const piece: NetworkPieceEntity = {
  id: networkPieceId("did:plc:peer", "ai.rizom.brain.post", "3kabc"),
  entityType: "network-piece",
  contentHash: "",
  content:
    "# Handoffs between teams\n\nBefore anyone leaves a task we write three things down.",
  created: "2026-10-01T10:00:00.000Z",
  updated: "2026-10-01T10:00:00.000Z",
  visibility: "public",
  metadata: {
    title: "Handoffs between teams",
    kind: "post",
    status: "published",
    brain: {
      did: "did:plc:peer",
      name: "Becca",
      url: "https://becca.rizom.ai",
    },
    origin: "https://becca.rizom.ai/essays/handoffs",
    collection: "ai.rizom.brain.post",
    rkey: "3kabc",
    cid: "bafy1",
    recordedAt: "2026-09-30T09:00:00.000Z",
    excerpt: "Before anyone leaves a task we write three things down.",
  },
};

describe("the network piece adapter", () => {
  let adapter: ReturnType<
    ReturnType<
      ReturnType<typeof createMockShell>["getEntityRegistry"]
    >["getAdapter"]
  >;
  let shell: Awaited<ReturnType<typeof install>>;
  beforeEach(async () => {
    shell = await install();
    adapter = shell.getEntityRegistry().getAdapter("network-piece");
  });

  it("keys a piece by its brain, kind and record, file-safely", () => {
    expect(networkPieceId("did:plc:peer", "ai.rizom.brain.post", "3kabc")).toBe(
      "plc-peer--post--3kabc",
    );
    expect(
      networkPieceId("did:plc:x", "ai.rizom.brain.socialPost", "3k/odd"),
    ).toBe("plc-x--social-post--3k-odd");
  });

  it("round-trips through markdown and storage with the brain and record intact", async () => {
    const markdown = adapter.toMarkdown(piece);
    expect(markdown).toContain("title: Handoffs between teams");
    expect(markdown).toContain("name: Becca");
    expect(markdown).toMatch(
      /origin: '?https:\/\/becca\.rizom\.ai\/essays\/handoffs'?/,
    );
    expect(markdown).toContain("Before anyone leaves a task");
    const back = adapter.fromMarkdown(markdown);
    expect(back.metadata).toEqual(piece.metadata);
    await shell
      .getEntityService()
      .createEntity({ entity: { ...piece, ...back } });
    const stored = await shell
      .getEntityService()
      .getEntity({ entityType: "network-piece", id: piece.id });
    expect(stored?.entityType).toBe("network-piece");
    expect(stored?.metadata).toEqual(piece.metadata);
    expect(stored && adapter.toMarkdown(stored)).toBe(markdown);
  });

  it("is published, so a visitor's answer may cite it", () => {
    expect(adapter.publishedStatuses).toEqual(["published"]);
  });
});

describe("a network piece in this brain", () => {
  it("is another brain's work: read, searched and cited here, never written by hand or republished", async () => {
    const shell = await install();
    const config = shell
      .getEntityRegistry()
      .getEntityTypeConfig("network-piece");
    expect(config.actionPolicy).toEqual({
      create: "never",
      update: "never",
      delete: "never",
      extract: "never",
      publish: "never",
    });
    expect(config.projectionSource).toBe(false);
    expect(config.embeddable).toBe(true);
  });
});
