import { describe, expect, it } from "bun:test";
import type { AtprotoLexicon, AtprotoLexiconProperty } from "../src";
import {
  getCanonicalAtprotoRecordSchema,
  listCanonicalAtprotoLexicons,
} from "../src";

/**
 * Records published to a PDS are a wire contract. A schema that silently
 * accepts and retains fields the lexicon never declared lets a typo — or a
 * field from a newer draft — ride along into the network as if it were
 * canonical, and nothing downstream can tell the difference.
 *
 * This is table-driven over the canonical registry rather than per-lexicon, so
 * a newly added lexicon is covered the moment it ships instead of inheriting a
 * permissive default.
 */

/** The shape shared by `defs.main.record` and every named object def. */
interface ObjectDefLike {
  required?: string[] | undefined;
  properties: Record<string, AtprotoLexiconProperty>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringAt(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = source[key];
  return typeof value === "string" ? value : undefined;
}

/** Read a nested lexicon property bag without assuming it is well-formed. */
function objectDefAt(source: Record<string, unknown>): ObjectDefLike {
  const rawProperties = source["properties"];
  const rawRequired = source["required"];
  const properties: Record<string, AtprotoLexiconProperty> = {};

  if (isPlainObject(rawProperties)) {
    for (const [name, candidate] of Object.entries(rawProperties)) {
      if (!isPlainObject(candidate)) continue;
      const type = stringAt(candidate, "type");
      if (type === undefined) continue;
      properties[name] = { ...candidate, type };
    }
  }

  const required = Array.isArray(rawRequired)
    ? rawRequired.filter((entry) => typeof entry === "string")
    : undefined;

  return required ? { required, properties } : { properties };
}

/** Build a minimal record satisfying only the lexicon's `required` fields. */
function minimalValidRecord(
  def: ObjectDefLike,
  lexicon: AtprotoLexicon,
): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  for (const key of def.required ?? []) {
    const property = def.properties[key];
    if (property) value[key] = sampleValue(property, lexicon);
  }
  return value;
}

function sampleValue(
  property: AtprotoLexiconProperty,
  lexicon: AtprotoLexicon,
): unknown {
  switch (property.type) {
    case "string": {
      const knownValues = property["knownValues"];
      if (Array.isArray(knownValues) && typeof knownValues[0] === "string") {
        return knownValues[0];
      }
      switch (stringAt(property, "format")) {
        case "datetime":
          return "2026-08-18T00:00:00.000Z";
        case "uri":
          return "https://rizom.ai";
        case "did":
          return "did:web:rizom.ai";
        default:
          return "x";
      }
    }
    case "integer":
      return 1;
    case "boolean":
      return true;
    case "array":
      return [];
    case "object":
      return minimalValidRecord(objectDefAt(property), lexicon);
    case "ref": {
      const ref = stringAt(property, "ref");
      const target = ref?.startsWith("#")
        ? lexicon.defs[ref.slice(1)]
        : undefined;
      return target?.type === "object"
        ? minimalValidRecord(target, lexicon)
        : {};
    }
    default:
      return "x";
  }
}

const cases = listCanonicalAtprotoLexicons().map((lexicon) => {
  const schema = getCanonicalAtprotoRecordSchema(lexicon.id);
  if (!schema) throw new Error(`no record schema for ${lexicon.id}`);
  const valid: Record<string, unknown> = {
    $type: lexicon.id,
    ...minimalValidRecord(lexicon.defs.main.record, lexicon),
  };
  return { id: lexicon.id, schema, valid };
});

describe("canonical ATProto record strictness", () => {
  it("covers every canonical lexicon", () => {
    expect(cases.length).toBe(listCanonicalAtprotoLexicons().length);
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const { id, schema, valid } of cases) {
    describe(id, () => {
      it("accepts a minimal valid record", () => {
        expect(schema.safeParse(valid).success).toBe(true);
      });

      it("rejects an undeclared top-level field", () => {
        expect(
          schema.safeParse({ ...valid, fieldTheLexiconNeverDeclared: "x" })
            .success,
        ).toBe(false);
      });
    });
  }

  it("rejects an undeclared field nested inside a record object", () => {
    const card = cases.find(({ id }) => id === "ai.rizom.brain.card");
    if (!card) throw new Error("card lexicon missing");

    const brain = card.valid["brain"];
    // The card lexicon nests `brain`; if that changes, retarget this rather
    // than dropping it — nested passthrough is the same hole one level down.
    if (!isPlainObject(brain)) {
      throw new Error("expected the card record to nest a brain object");
    }

    expect(
      card.schema.safeParse({
        ...card.valid,
        brain: { ...brain, notInLexicon: "x" },
      }).success,
    ).toBe(false);
  });
});
