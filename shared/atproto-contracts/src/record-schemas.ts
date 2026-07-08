import { z } from "@brains/utils/zod";
import type {
  AtprotoLexicon,
  AtprotoLexiconProperty,
  CanonicalAtprotoLexiconId,
} from "./lexicon";
import { canonicalAtprotoLexicons } from "./lexicon";

interface AtprotoSchemaProperty extends AtprotoLexiconProperty {
  required?: string[] | undefined;
  properties?: Record<string, AtprotoSchemaProperty> | undefined;
  items?: AtprotoSchemaProperty | undefined;
  knownValues?: string[] | undefined;
  maxLength?: number | undefined;
  format?: string | undefined;
}

export type AtprotoRecordSchema = z.ZodType<Record<string, unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// RFC 3339 date-time with required offset (Z or ±hh:mm), matching the AT
// Protocol `datetime` string format. Lenient Date.parse would accept "2026-01-01".
const RFC3339_DATETIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function buildAtprotoStringSchema(
  property: AtprotoSchemaProperty,
): z.ZodType<string> {
  const baseSchema = z.string();
  let schema: z.ZodType<string> =
    property.maxLength !== undefined
      ? baseSchema.max(property.maxLength)
      : baseSchema;
  if (property.knownValues) {
    schema = schema.refine((value) => property.knownValues?.includes(value), {
      message: `expected one of ${property.knownValues.join(", ")}`,
    });
  }
  if (property.format === "datetime") {
    schema = schema.refine(
      (value) =>
        RFC3339_DATETIME.test(value) && !Number.isNaN(Date.parse(value)),
      { message: "expected datetime" },
    );
  }
  if (property.format === "uri") {
    schema = schema.refine(
      (value) => {
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      },
      { message: "expected uri" },
    );
  }
  return schema;
}

function buildAtprotoFieldSchema(
  property: AtprotoSchemaProperty,
): z.ZodType<unknown> {
  switch (property.type) {
    case "string":
      return buildAtprotoStringSchema(property);
    case "integer":
      return z.number().int();
    case "boolean":
      return z.boolean();
    case "array": {
      const itemSchema = property.items
        ? buildAtprotoFieldSchema(property.items)
        : z.unknown();
      let schema = z.array(itemSchema);
      if (property.maxLength !== undefined) {
        schema = schema.max(property.maxLength);
      }
      return schema;
    }
    case "object":
      return buildAtprotoObjectSchema(property);
    case "blob":
      return z.custom<Record<string, unknown>>(isRecord, {
        message: "expected blob",
      });
    default:
      return z.unknown();
  }
}

function buildAtprotoObjectShape(
  property: AtprotoSchemaProperty,
): Record<string, z.ZodType<unknown>> {
  const requiredFields = new Set(property.required ?? []);
  const shape: Record<string, z.ZodType<unknown>> = {};
  for (const [field, fieldProperty] of Object.entries(
    property.properties ?? {},
  )) {
    const fieldSchema = buildAtprotoFieldSchema(fieldProperty);
    shape[field] = requiredFields.has(field)
      ? fieldSchema
      : fieldSchema.optional();
  }
  return shape;
}

function buildAtprotoObjectSchema(
  property: AtprotoSchemaProperty,
): AtprotoRecordSchema {
  return z.object(buildAtprotoObjectShape(property)).passthrough();
}

function reportUnexpectedFields(
  value: Record<string, unknown>,
  allowedFields: Set<string>,
  ctx: z.RefinementCtx,
  path: Array<string | number> = [],
): void {
  const unexpected = Object.keys(value).filter(
    (key) => !allowedFields.has(key),
  );
  if (unexpected.length === 0) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message: `unrecognized field(s): ${unexpected.join(", ")}`,
  });
}

function refineBrainCardRecord(
  value: Record<string, unknown>,
  ctx: z.RefinementCtx,
): void {
  reportUnexpectedFields(
    value,
    new Set([
      "$type",
      "siteUrl",
      "brain",
      "anchor",
      "skills",
      "model",
      "version",
      "createdAt",
      "updatedAt",
    ]),
    ctx,
  );
  if (isRecord(value["brain"])) {
    reportUnexpectedFields(
      value["brain"],
      new Set(["did", "name", "role", "purpose", "values"]),
      ctx,
      ["brain"],
    );
  }
  if (isRecord(value["anchor"])) {
    reportUnexpectedFields(
      value["anchor"],
      new Set(["did", "name", "kind"]),
      ctx,
      ["anchor"],
    );
  }
}

export function buildAtprotoRecordSchema(
  lexicon: AtprotoLexicon,
): AtprotoRecordSchema {
  const schema = z
    .object({
      ...buildAtprotoObjectShape(lexicon.defs.main.record),
      $type: z.literal(lexicon.id).optional(),
    })
    .passthrough();
  return lexicon.id === "ai.rizom.brain.card"
    ? schema.superRefine(refineBrainCardRecord)
    : schema;
}

export type CanonicalAtprotoRecordSchemaId = CanonicalAtprotoLexiconId;

export const canonicalAtprotoRecordSchemas: Record<
  CanonicalAtprotoRecordSchemaId,
  AtprotoRecordSchema
> = {
  "ai.rizom.brain.card": buildAtprotoRecordSchema(
    canonicalAtprotoLexicons["ai.rizom.brain.card"],
  ),
  "ai.rizom.brain.deck": buildAtprotoRecordSchema(
    canonicalAtprotoLexicons["ai.rizom.brain.deck"],
  ),
  "ai.rizom.brain.link": buildAtprotoRecordSchema(
    canonicalAtprotoLexicons["ai.rizom.brain.link"],
  ),
  "ai.rizom.brain.note": buildAtprotoRecordSchema(
    canonicalAtprotoLexicons["ai.rizom.brain.note"],
  ),
  "ai.rizom.brain.post": buildAtprotoRecordSchema(
    canonicalAtprotoLexicons["ai.rizom.brain.post"],
  ),
  "ai.rizom.brain.project": buildAtprotoRecordSchema(
    canonicalAtprotoLexicons["ai.rizom.brain.project"],
  ),
  "ai.rizom.brain.series": buildAtprotoRecordSchema(
    canonicalAtprotoLexicons["ai.rizom.brain.series"],
  ),
  "ai.rizom.brain.socialPost": buildAtprotoRecordSchema(
    canonicalAtprotoLexicons["ai.rizom.brain.socialPost"],
  ),
  "ai.rizom.brain.topic": buildAtprotoRecordSchema(
    canonicalAtprotoLexicons["ai.rizom.brain.topic"],
  ),
};

export function listCanonicalAtprotoRecordSchemas(): AtprotoRecordSchema[] {
  return Object.values(canonicalAtprotoRecordSchemas);
}

export function getCanonicalAtprotoRecordSchema(
  id: string,
): AtprotoRecordSchema | undefined {
  return canonicalAtprotoRecordSchemas[id as CanonicalAtprotoLexiconId];
}

function getRecordPathValue(
  record: Record<string, unknown>,
  path: readonly PropertyKey[],
): unknown {
  let value: unknown = record;
  for (const segment of path) {
    if (typeof segment === "symbol") return undefined;
    if (Array.isArray(value)) {
      value = value[Number(segment)];
      continue;
    }
    if (!isRecord(value)) return undefined;
    value = value[String(segment)];
  }
  return value;
}

function formatAtprotoSchemaIssue(
  lexicon: AtprotoLexicon,
  record: Record<string, unknown>,
  issue: z.ZodIssue,
): string {
  const path = issue.path.join(".");
  if (path === "$type") {
    return `AT Protocol record $type must match lexicon id: ${String(
      record["$type"],
    )} !== ${lexicon.id}`;
  }
  if (
    issue.code === "invalid_type" &&
    getRecordPathValue(record, issue.path) === undefined
  ) {
    return `Missing required AT Protocol record field: ${path}`;
  }
  if (issue.code === "invalid_type") {
    return `Invalid AT Protocol record field ${path}: expected ${issue.expected}`;
  }
  if (issue.code === "too_big") {
    return `Invalid AT Protocol record field ${path}: exceeds maxLength ${issue.maximum}`;
  }
  if (issue.code === "custom") {
    return `Invalid AT Protocol record field ${path}: ${issue.message}`;
  }
  if (issue.code === "unrecognized_keys") {
    return `Unrecognized AT Protocol record field(s): ${issue.keys.join(", ")}`;
  }
  return `Invalid AT Protocol record field ${path}: ${issue.message}`;
}

export function validateAtprotoRecord(
  lexicon: AtprotoLexicon,
  record: Record<string, unknown>,
): void {
  const result = buildAtprotoRecordSchema(lexicon).safeParse(record);
  if (result.success) return;
  const issue = result.error.issues[0];
  if (!issue) throw result.error;
  throw new Error(formatAtprotoSchemaIssue(lexicon, record, issue));
}
