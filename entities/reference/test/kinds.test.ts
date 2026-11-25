import { describe, expect, it } from "bun:test";
import { authorRepo, referenceBrain } from "./reference-fixture";

/** An author publishing one record of a kind other than a post. */
function publishing(
  collection: string,
  rkey: string,
  value: Record<string, unknown>,
): ReturnType<typeof authorRepo> {
  const repo = authorRepo();
  repo.others.set(collection, new Map([[rkey, value]]));
  return repo;
}

async function captured(
  repo: ReturnType<typeof authorRepo>,
  address: string,
): Promise<Record<string, unknown> | undefined> {
  const brain = await referenceBrain(repo);
  await brain.feature(address);
  return (await brain.references())[0]?.metadata;
}

describe("the kinds of entity a reference can point to", () => {
  it("points to a deck, read from its own record", async () => {
    const repo = publishing("ai.rizom.brain.deck", "the-talk", {
      title: "The talk",
      description: "Slides from the gathering.",
      body: "SLIDE ONE",
      event: "Gathering 2026",
      canonicalUrl: "https://author.example/decks/the-talk",
      sourceEntityType: "deck",
      sourceEntityId: "the-talk",
      createdAt: "2026-06-01T00:00:00.000Z",
      publishedAt: "2026-06-03T00:00:00.000Z",
    });

    expect(
      await captured(repo, "https://author.example/decks/the-talk"),
    ).toEqual({
      status: "draft",
      title: "The talk",
      summary: "Slides from the gathering.",
      author: "Ada Author",
      authorSite: "author.example",
      url: "https://author.example/decks/the-talk",
      publishedAt: "2026-06-03T00:00:00.000Z",
      sourceState: "active",
      sourceUri: "at://did:plc:author/ai.rizom.brain.deck/the-talk",
      sourceEntityType: "deck",
      sourceEntityId: "the-talk",
    });
  });

  it("points to a project", async () => {
    const repo = publishing("ai.rizom.brain.project", "commons", {
      title: "The commons",
      description: "A shared library.",
      body: "CASE STUDY",
      year: 2026,
      canonicalUrl: "https://author.example/projects/commons",
      sourceEntityType: "project",
      sourceEntityId: "commons",
      createdAt: "2026-02-01T00:00:00.000Z",
    });

    expect(
      await captured(repo, "https://author.example/projects/commons"),
    ).toMatchObject({
      title: "The commons",
      summary: "A shared library.",
      publishedAt: "2026-02-01T00:00:00.000Z",
      sourceEntityType: "project",
    });
  });

  it("points to a series", async () => {
    const repo = publishing("ai.rizom.brain.series", "common-sense", {
      title: "Common Sense",
      description: "Essays on shared understanding.",
      canonicalUrl: "https://author.example/series/common-sense",
      sourceEntityType: "series",
      sourceEntityId: "common-sense",
      createdAt: "2026-03-01T00:00:00.000Z",
    });

    expect(
      await captured(repo, "https://author.example/series/common-sense"),
    ).toMatchObject({
      title: "Common Sense",
      sourceEntityType: "series",
      sourceUri: "at://did:plc:author/ai.rizom.brain.series/common-sense",
    });
  });

  it("names the kind from the collection when the record does not", async () => {
    const repo = publishing("ai.rizom.brain.deck", "older-deck", {
      title: "An older deck",
      body: "SLIDES",
      canonicalUrl: "https://author.example/decks/older-deck",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(
      await captured(repo, "https://author.example/decks/older-deck"),
    ).toMatchObject({
      sourceEntityType: "deck",
      sourceEntityId: "older-deck",
    });
  });

  for (const [collection, kind] of [
    ["ai.rizom.brain.link", "link"],
    ["ai.rizom.brain.note", "note"],
    ["ai.rizom.brain.topic", "topic"],
    ["ai.rizom.brain.socialPost", "social-post"],
  ] as const) {
    it(`points to a ${kind} that has a page on its author's site`, async () => {
      const repo = publishing(collection, "a-piece", {
        title: "A piece",
        body: "THE WHOLE TEXT",
        canonicalUrl: `https://author.example/${kind}/a-piece`,
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      expect(
        await captured(repo, `https://author.example/${kind}/a-piece`),
      ).toMatchObject({
        title: "A piece",
        sourceEntityType: kind,
        sourceUri: `at://did:plc:author/${collection}/a-piece`,
      });
    });
  }

  it("does not point to a piece its author's site gives no page", async () => {
    const repo = publishing("ai.rizom.brain.note", "a-note", {
      title: "A note",
      body: "NOTE",
      sourceEntityType: "note",
      sourceEntityId: "a-note",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(
      await captured(repo, "https://author.example/notes/a-note"),
    ).toBeUndefined();
  });
});
