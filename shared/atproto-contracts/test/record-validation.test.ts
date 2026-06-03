import { describe, expect, it } from "bun:test";
import {
  buildAtprotoRecordSchema,
  canonicalAtprotoRecordSchemas,
  getCanonicalAtprotoRecordSchema,
  listCanonicalAtprotoLexicons,
  listCanonicalAtprotoRecordSchemas,
  parseAtprotoLexicon,
  validateAtprotoRecord,
} from "../src";

const lexicon = parseAtprotoLexicon({
  lexicon: 1,
  id: "ai.rizom.brain.test",
  defs: {
    main: {
      type: "record",
      key: "tid",
      record: {
        type: "object",
        required: ["title", "createdAt", "count"],
        properties: {
          title: { type: "string", maxLength: 20 },
          createdAt: { type: "string", format: "datetime" },
          count: { type: "integer" },
          tags: { type: "array", items: { type: "string" }, maxLength: 2 },
          nested: {
            type: "object",
            required: ["label"],
            properties: { label: { type: "string" } },
          },
        },
      },
    },
  },
});

describe("ATProto Zod-backed record schemas", () => {
  it("exports one canonical record schema for every canonical lexicon", () => {
    expect(Object.keys(canonicalAtprotoRecordSchemas).sort()).toEqual(
      listCanonicalAtprotoLexicons()
        .map((candidate) => candidate.id)
        .sort(),
    );
    expect(listCanonicalAtprotoRecordSchemas()).toHaveLength(
      listCanonicalAtprotoLexicons().length,
    );
    for (const lexicon of listCanonicalAtprotoLexicons()) {
      expect(getCanonicalAtprotoRecordSchema(lexicon.id)).toBe(
        canonicalAtprotoRecordSchemas[
          lexicon.id as keyof typeof canonicalAtprotoRecordSchemas
        ],
      );
    }
  });

  it("accepts records matching a lexicon-derived schema", () => {
    const schema = buildAtprotoRecordSchema(lexicon);

    expect(
      schema.parse({
        $type: "ai.rizom.brain.test",
        title: "Valid",
        createdAt: "2026-05-31T10:00:00.000Z",
        count: 1,
        tags: ["one", "two"],
        nested: { label: "Nested" },
      }),
    ).toMatchObject({ title: "Valid", count: 1 });
  });

  it("allows records without $type but rejects mismatched $type", () => {
    const schema = buildAtprotoRecordSchema(lexicon);

    expect(() =>
      schema.parse({
        title: "Valid",
        createdAt: "2026-05-31T10:00:00.000Z",
        count: 1,
      }),
    ).not.toThrow();
    expect(() =>
      schema.parse({
        $type: "ai.rizom.brain.other",
        title: "Valid",
        createdAt: "2026-05-31T10:00:00.000Z",
        count: 1,
      }),
    ).toThrow();
  });

  it("enforces lexicon constraints in the generated schema", () => {
    const schema = buildAtprotoRecordSchema(lexicon);

    expect(() =>
      schema.parse({
        $type: "ai.rizom.brain.test",
        title: "This title is too long for this test lexicon",
        createdAt: "2026-05-31T10:00:00.000Z",
        count: 1,
      }),
    ).toThrow();
    expect(() =>
      schema.parse({
        $type: "ai.rizom.brain.test",
        title: "Valid",
        createdAt: "not-a-date",
        count: 1,
      }),
    ).toThrow();
    expect(() =>
      schema.parse({
        $type: "ai.rizom.brain.test",
        title: "Valid",
        createdAt: "2026-05-31T10:00:00.000Z",
        count: 1,
        tags: ["one", "two", "three"],
      }),
    ).toThrow();
  });

  it("parses canonical post records with nested blob references", () => {
    const schema = canonicalAtprotoRecordSchemas["ai.rizom.brain.post"];

    expect(
      schema.parse({
        $type: "ai.rizom.brain.post",
        title: "Post",
        body: "# Post",
        format: "text/markdown",
        canonicalUrl: "https://example.com/post",
        topics: ["atproto"],
        coverImage: {
          blob: {
            ref: {
              $link:
                "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            },
            mimeType: "image/png",
            size: 42,
          },
          alt: "Cover",
          width: 1200,
          height: 630,
        },
        sourceEntityType: "post",
        sourceEntityId: "post-1",
        createdAt: "2026-05-31T10:00:00.000Z",
      }),
    ).toMatchObject({ title: "Post", sourceEntityType: "post" });
  });

  it("rejects canonical post records that violate known values", () => {
    const schema = canonicalAtprotoRecordSchemas["ai.rizom.brain.post"];

    expect(() =>
      schema.parse({
        title: "Post",
        body: "# Post",
        sourceEntityType: "note",
        createdAt: "2026-05-31T10:00:00.000Z",
      }),
    ).toThrow();
  });
});

describe("validateAtprotoRecord", () => {
  it("accepts records matching the registered lexicon", () => {
    expect(() =>
      validateAtprotoRecord(lexicon, {
        $type: "ai.rizom.brain.test",
        title: "Valid",
        createdAt: "2026-05-31T10:00:00.000Z",
        count: 1,
        tags: ["one", "two"],
        nested: { label: "Nested" },
      }),
    ).not.toThrow();
  });

  it("rejects records with the wrong $type", () => {
    expect(() =>
      validateAtprotoRecord(lexicon, {
        $type: "ai.rizom.brain.other",
        title: "Valid",
        createdAt: "2026-05-31T10:00:00.000Z",
        count: 1,
      }),
    ).toThrow();
  });

  it("rejects missing required fields", () => {
    expect(() =>
      validateAtprotoRecord(lexicon, {
        $type: "ai.rizom.brain.test",
        title: "Valid",
        createdAt: "2026-05-31T10:00:00.000Z",
      }),
    ).toThrow();
  });

  it("rejects field type mismatches", () => {
    expect(() =>
      validateAtprotoRecord(lexicon, {
        $type: "ai.rizom.brain.test",
        title: "Valid",
        createdAt: "2026-05-31T10:00:00.000Z",
        count: "one",
      }),
    ).toThrow();
  });

  it("rejects nested object mismatches", () => {
    expect(() =>
      validateAtprotoRecord(lexicon, {
        $type: "ai.rizom.brain.test",
        title: "Valid",
        createdAt: "2026-05-31T10:00:00.000Z",
        count: 1,
        nested: {},
      }),
    ).toThrow();
  });
});
