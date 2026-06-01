import { describe, expect, it } from "bun:test";
import { parseAtprotoLexicon, validateAtprotoRecord } from "../src";

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
    ).toThrow("AT Protocol record $type must match lexicon id");
  });

  it("rejects missing required fields", () => {
    expect(() =>
      validateAtprotoRecord(lexicon, {
        $type: "ai.rizom.brain.test",
        title: "Valid",
        createdAt: "2026-05-31T10:00:00.000Z",
      }),
    ).toThrow("Missing required AT Protocol record field: count");
  });

  it("rejects field type mismatches", () => {
    expect(() =>
      validateAtprotoRecord(lexicon, {
        $type: "ai.rizom.brain.test",
        title: "Valid",
        createdAt: "2026-05-31T10:00:00.000Z",
        count: "one",
      }),
    ).toThrow("Invalid AT Protocol record field count: expected integer");
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
    ).toThrow("Missing required AT Protocol record field: nested.label");
  });
});
