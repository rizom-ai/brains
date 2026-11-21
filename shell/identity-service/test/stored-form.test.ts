import { describe, expect, it } from "bun:test";
import { AnchorProfileAdapter } from "../src/anchor-profile-adapter";
import { BrainCharacterAdapter } from "../src/brain-character-adapter";
import type { AnchorProfileEntity } from "../src/anchor-profile-schema";
import type { BrainCharacterEntity } from "../src/brain-character-schema";

/**
 * The identity singletons in their next stored form
 * (docs/plans/one-stored-form.md). A field update writes a field straight
 * into a singleton's header; on a document in the next form the header's
 * value is the fresh one, over the body section it replaces, and the
 * write that follows states it in the body once.
 */
const profileNext = `---
name: Alex Chen
intro: A fresh introduction.
---
## Description

Architect and writer.

## Intro

A stale introduction.

## Story

I started in telecom.
`;

function profile(content: string): AnchorProfileEntity {
  return {
    id: "anchor-profile",
    entityType: "anchor-profile",
    content,
    contentHash: "",
    visibility: "public",
    created: "2026-01-01T00:00:00.000Z",
    updated: "2026-01-01T00:00:00.000Z",
    metadata: {},
  };
}

function character(content: string): BrainCharacterEntity {
  return {
    id: "brain-character",
    entityType: "brain-character",
    content,
    contentHash: "",
    visibility: "public",
    created: "2026-01-01T00:00:00.000Z",
    updated: "2026-01-01T00:00:00.000Z",
    metadata: {},
  };
}

describe("an identity singleton in the next stored form", () => {
  it("reads a field update's header value over the body section it replaces", () => {
    const adapter = new AnchorProfileAdapter();
    expect(adapter.parseProfileBody(profileNext)).toMatchObject({
      name: "Alex Chen",
      description: "Architect and writer.",
    });
    expect(adapter.toMarkdown(profile(profileNext), { form: "new" })).toBe(`---
name: Alex Chen
---
## Description

Architect and writer.

## Intro

A fresh introduction.

## Story

I started in telecom.
`);
  });

  it("keeps a current-form story that opens on a heading as it is", () => {
    const adapter = new AnchorProfileAdapter();
    const current =
      "---\nname: Alex Chen\ndescription: Writer.\n---\n## About me\n\nI write.\n";
    expect(adapter.toMarkdown(profile(current), { form: "old" })).toBe(current);
  });

  it("reads the character's purpose from its header over a stale section", () => {
    const adapter = new BrainCharacterAdapter();
    const next =
      "---\nname: Brain\nrole: Assistant\npurpose: Fresh purpose.\n---\n## Purpose\n\nStale purpose.\n\n## Values\n\n- clarity\n";
    expect(adapter.parseCharacterBody(next)).toEqual({
      name: "Brain",
      role: "Assistant",
      purpose: "Fresh purpose.",
      values: ["clarity"],
    });
    expect(adapter.toMarkdown(character(next), { form: "new" })).toBe(
      "---\nname: Brain\nrole: Assistant\n---\n## Purpose\n\nFresh purpose.\n\n## Values\n\n- clarity\n",
    );
  });
});
