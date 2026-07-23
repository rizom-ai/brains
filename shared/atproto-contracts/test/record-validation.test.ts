import { describe, expect, it } from "bun:test";
import {
  buildAtprotoRecordSchema,
  canonicalAtprotoRecordSchemas,
  getCanonicalAtprotoRecordSchema,
  listCanonicalAtprotoLexicons,
  listCanonicalAtprotoRecordSchemas,
  normalizeDiscoveredBrainCard,
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

const refLexicon = parseAtprotoLexicon({
  lexicon: 1,
  id: "ai.rizom.brain.refTest",
  defs: {
    main: {
      type: "record",
      key: "tid",
      record: {
        type: "object",
        required: ["detail", "createdAt"],
        properties: {
          detail: { type: "ref", ref: "#detail" },
          dangling: { type: "ref", ref: "#missing" },
          createdAt: { type: "string", format: "datetime" },
        },
      },
    },
    detail: {
      type: "object",
      required: ["label"],
      properties: {
        label: { type: "string", maxLength: 20 },
        kind: { type: "string", knownValues: ["one", "two"] },
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

  it("parses canonical brain cards with brain and minimal anchor identity", () => {
    const schema = canonicalAtprotoRecordSchemas["ai.rizom.brain.card"];

    expect(
      schema.parse({
        $type: "ai.rizom.brain.card",
        siteUrl: "https://brain.example.com",
        brain: {
          did: "did:web:brain.example.com",
          name: "Test Brain",
          role: "assistant",
          purpose: "Help with testing",
          values: ["reliable"],
        },
        anchor: {
          did: "did:web:brain.example.com:anchor",
          name: "Test Owner",
          kind: "person",
        },
        skills: [],
        model: "test-brain",
        version: "1.0.0",
        createdAt: "2026-05-31T10:00:00.000Z",
      }),
    ).toMatchObject({
      brain: { did: "did:web:brain.example.com" },
      anchor: { did: "did:web:brain.example.com:anchor" },
    });
  });

  it("rejects old top-level brain card identity fields", () => {
    const schema = canonicalAtprotoRecordSchemas["ai.rizom.brain.card"];

    expect(() =>
      schema.parse({
        $type: "ai.rizom.brain.card",
        name: "Old Brain",
        description: "Old card shape",
        siteUrl: "https://brain.example.com",
        skills: [],
        model: "test-brain",
        version: "1.0.0",
        brainDid: "did:web:brain.example.com",
        anchorDid: "did:web:brain.example.com:anchor",
        createdAt: "2026-05-31T10:00:00.000Z",
      }),
    ).toThrow();
  });

  it("rejects duplicate endpoint and identity fields on brain cards", () => {
    const schema = canonicalAtprotoRecordSchemas["ai.rizom.brain.card"];

    expect(() =>
      schema.parse({
        $type: "ai.rizom.brain.card",
        siteUrl: "https://brain.example.com",
        brain: {
          did: "did:web:brain.example.com",
          name: "Test Brain",
          role: "assistant",
          purpose: "Help with testing",
          values: ["reliable"],
        },
        anchor: {
          did: "did:web:brain.example.com:anchor",
          name: "Test Owner",
          kind: "person",
        },
        skills: [],
        model: "test-brain",
        version: "1.0.0",
        createdAt: "2026-05-31T10:00:00.000Z",
        brainDid: "did:web:brain.example.com",
        anchorDid: "did:web:brain.example.com:anchor",
        a2aEndpoint: "https://brain.example.com/a2a",
        agentCardUrl: "https://brain.example.com/.well-known/agent-card.json",
      }),
    ).toThrow();
  });

  it("validates ref-typed fields against their named object defs", () => {
    const schema = buildAtprotoRecordSchema(refLexicon);
    const createdAt = "2026-05-31T10:00:00.000Z";

    expect(() =>
      schema.parse({ detail: { label: "Valid", kind: "one" }, createdAt }),
    ).not.toThrow();
    expect(() =>
      schema.parse({ detail: "not-an-object", createdAt }),
    ).toThrow();
    expect(() => schema.parse({ detail: {}, createdAt })).toThrow();
    expect(() =>
      schema.parse({
        detail: { label: "this label is far too long for the def" },
        createdAt,
      }),
    ).toThrow();
    expect(() =>
      schema.parse({ detail: { label: "Valid", kind: "three" }, createdAt }),
    ).toThrow();
  });

  it("fails closed on unresolvable refs", () => {
    const schema = buildAtprotoRecordSchema(refLexicon);
    const createdAt = "2026-05-31T10:00:00.000Z";

    expect(() =>
      schema.parse({
        detail: { label: "Valid" },
        dangling: { anything: true },
        createdAt,
      }),
    ).toThrow();
    // Absent optional field with a dangling ref does not block the record.
    expect(() =>
      schema.parse({ detail: { label: "Valid" }, createdAt }),
    ).not.toThrow();
  });

  it("rejects canonical brain cards with malformed ref-typed identity", () => {
    const schema = canonicalAtprotoRecordSchemas["ai.rizom.brain.card"];
    const validCard = {
      $type: "ai.rizom.brain.card",
      siteUrl: "https://brain.example.com",
      brain: {
        did: "did:web:brain.example.com",
        name: "Test Brain",
        role: "assistant",
        purpose: "Help with testing",
        values: ["reliable"],
      },
      anchor: {
        did: "did:web:brain.example.com:anchor",
        name: "Test Owner",
        kind: "person",
      },
      skills: [],
      model: "test-brain",
      version: "1.0.0",
      createdAt: "2026-05-31T10:00:00.000Z",
    };

    expect(() =>
      schema.parse({ ...validCard, brain: "not-an-object" }),
    ).toThrow();
    expect(() => schema.parse({ ...validCard, anchor: {} })).toThrow();
    expect(() =>
      schema.parse({
        ...validCard,
        anchor: { ...validCard.anchor, kind: "invalid-kind" },
      }),
    ).toThrow();
    expect(() => schema.parse({ ...validCard, skills: [42] })).toThrow();
    expect(() =>
      schema.parse({
        ...validCard,
        skills: [{ id: "s1", name: "Skill" }],
      }),
    ).toThrow();
  });

  it("rejects canonical link records with malformed ref-typed source", () => {
    const schema = canonicalAtprotoRecordSchemas["ai.rizom.brain.link"];
    const validLink = {
      $type: "ai.rizom.brain.link",
      title: "Link",
      url: "https://example.com",
      createdAt: "2026-05-31T10:00:00.000Z",
    };

    expect(() => schema.parse({ ...validLink, source: 123 })).toThrow();
    expect(() =>
      schema.parse({ ...validLink, source: { ref: "conv-1" } }),
    ).toThrow();
    expect(() =>
      schema.parse({
        ...validLink,
        source: { ref: "conv-1", label: "Conversation" },
      }),
    ).not.toThrow();
  });

  it("rejects canonical post records with malformed ref-typed coverImage", () => {
    const schema = canonicalAtprotoRecordSchemas["ai.rizom.brain.post"];

    expect(() =>
      schema.parse({
        $type: "ai.rizom.brain.post",
        title: "Post",
        body: "# Post",
        sourceEntityType: "post",
        sourceEntityId: "post-1",
        createdAt: "2026-05-31T10:00:00.000Z",
        coverImage: "garbage",
      }),
    ).toThrow();
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

describe("normalizeDiscoveredBrainCard", () => {
  const card = {
    $type: "ai.rizom.brain.card",
    anchor: { did: "did:plc:a", name: "Anchor", kind: "person" },
  };

  it("converts cross-version anchor kinds to this build's vocabulary", () => {
    expect(
      normalizeDiscoveredBrainCard({
        ...card,
        anchor: { ...card.anchor, kind: "professional" },
      }),
    ).toMatchObject({ anchor: { kind: "person" } });
    expect(
      normalizeDiscoveredBrainCard({
        ...card,
        anchor: { ...card.anchor, kind: "collective" },
      }),
    ).toMatchObject({ anchor: { kind: "organization" } });
  });

  it("leaves canonical, unknown, and malformed anchors untouched", () => {
    for (const kind of ["person", "team", "organization", "mystery"]) {
      const input = { ...card, anchor: { ...card.anchor, kind } };
      expect(normalizeDiscoveredBrainCard(input)).toBe(input);
    }
    const noAnchor = { $type: "ai.rizom.brain.card" };
    expect(normalizeDiscoveredBrainCard(noAnchor)).toBe(noAnchor);
    const brokenAnchor = { ...card, anchor: "not-an-object" };
    expect(normalizeDiscoveredBrainCard(brokenAnchor)).toBe(brokenAnchor);
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
