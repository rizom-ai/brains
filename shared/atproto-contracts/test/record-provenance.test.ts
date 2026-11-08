import { describe, expect, it } from "bun:test";
import {
  atprotoProvenance,
  canonicalAtprotoLexicons,
  defineAtprotoProjection,
} from "../src";
import type { AtprotoBrainNoteRecord } from "../src";

const entity = {
  entityType: "note",
  id: "note-1",
  created: "2026-05-28T10:00:00.000Z",
  updated: "2026-05-28T11:00:00.000Z",
};

describe("a projected record's provenance", () => {
  it("carries the brain, anchor, page and source entity in record order", () => {
    const provenance = atprotoProvenance(
      {
        config: {
          brainDid: "did:web:brain.example.com",
          anchorDid: "did:plc:anchor",
        },
        pageUrl: "https://brain.example.com/notes/note-1",
      },
      entity,
    );

    expect(Object.entries(provenance)).toEqual([
      ["brainDid", "did:web:brain.example.com"],
      ["anchorDid", "did:plc:anchor"],
      ["canonicalUrl", "https://brain.example.com/notes/note-1"],
      ["sourceEntityType", "note"],
      ["sourceEntityId", "note-1"],
      ["createdAt", "2026-05-28T10:00:00.000Z"],
      ["updatedAt", "2026-05-28T11:00:00.000Z"],
    ]);
  });

  it("leaves out the brain, anchor and page when there are none", () => {
    const provenance = atprotoProvenance({ config: {} }, entity);

    expect(Object.keys(provenance)).toEqual([
      "sourceEntityType",
      "sourceEntityId",
      "createdAt",
      "updatedAt",
    ]);
  });

  it("leaves out empty brain, anchor and page values", () => {
    const provenance = atprotoProvenance(
      { config: { brainDid: "", anchorDid: "" }, pageUrl: "" },
      entity,
    );

    expect(Object.keys(provenance)).not.toContain("brainDid");
    expect(Object.keys(provenance)).not.toContain("anchorDid");
    expect(Object.keys(provenance)).not.toContain("canonicalUrl");
  });

  it("names an update only when the entity was updated", () => {
    const { updated: _updated, ...neverUpdated } = entity;

    expect(
      Object.keys(atprotoProvenance({ config: {} }, neverUpdated)),
    ).toEqual(["sourceEntityType", "sourceEntityId", "createdAt"]);
    expect(
      Object.keys(
        atprotoProvenance({ config: {} }, { ...entity, updated: "" }),
      ),
    ).not.toContain("updatedAt");
  });
});

describe("an entity's ATProto projection", () => {
  const buildRecord = async (): Promise<AtprotoBrainNoteRecord> => ({
    $type: "ai.rizom.brain.note",
    title: "A note",
    body: "A note body.",
    createdAt: "2026-05-28T10:00:00.000Z",
  });

  it("publishes to its collection under the canonical lexicon, unvalidated by the PDS", () => {
    const projection = defineAtprotoProjection({
      entityType: "note",
      collection: "ai.rizom.brain.note",
      buildRecord,
    });

    expect(projection.entityType).toBe("note");
    expect(projection.collection).toBe("ai.rizom.brain.note");
    expect(projection.lexicon).toBe(
      canonicalAtprotoLexicons["ai.rizom.brain.note"],
    );
    expect(projection.validate).toBe(false);
    expect(projection.buildRecord).toBe(buildRecord);
  });

  it("refuses a collection whose records the projection does not build", () => {
    const projection = defineAtprotoProjection({
      entityType: "note",
      collection: "ai.rizom.brain.deck",
      // @ts-expect-error a note record does not belong in the deck collection
      buildRecord,
    });

    expect(projection.collection).toBe("ai.rizom.brain.deck");
  });
});
