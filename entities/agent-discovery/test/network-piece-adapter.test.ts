import { describe, expect, it } from "bun:test";
import {
  NetworkPieceAdapter,
  networkPieceId,
} from "../src/adapters/network-piece-adapter";
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
  const adapter = new NetworkPieceAdapter();

  it("keys a piece by its brain, kind and record, file-safely", () => {
    expect(networkPieceId("did:plc:peer", "ai.rizom.brain.post", "3kabc")).toBe(
      "plc-peer--post--3kabc",
    );
    expect(
      networkPieceId("did:plc:x", "ai.rizom.brain.socialPost", "3k/odd"),
    ).toBe("plc-x--social-post--3k-odd");
  });

  it("round-trips through markdown with the brain and the record in front matter", () => {
    const markdown = adapter.toMarkdown(piece);
    expect(markdown).toContain("title: Handoffs between teams");
    expect(markdown).toContain("name: Becca");
    expect(markdown).toMatch(
      /origin: '?https:\/\/becca\.rizom\.ai\/essays\/handoffs'?/,
    );
    expect(markdown).toContain("Before anyone leaves a task");
    const back = adapter.fromMarkdown(markdown);
    expect(back.metadata).toEqual(piece.metadata);
    expect(back.entityType).toBe("network-piece");
  });

  it("is published, so a visitor's answer may cite it", () => {
    expect(adapter.publishedStatuses).toEqual(["published"]);
  });
});
