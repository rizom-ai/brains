import type { LinkedInSnapshotRecord } from "./linkedin-client";

export type LinkedInSnapshotValueType =
  "array" | "boolean" | "null" | "number" | "object" | "string";

export type LinkedInSnapshotRedactedScalar =
  | "<array>"
  | "<boolean>"
  | "<email>"
  | "<empty-string>"
  | "<month-year>"
  | "<null>"
  | "<number>"
  | "<object>"
  | "<string>"
  | "<timestamp>"
  | "<urn>"
  | "<url>"
  | "<year>"
  | "<year-month>"
  | "<year-month-day>";

export type LinkedInSnapshotRedactedValue =
  LinkedInSnapshotRedactedScalar | LinkedInSnapshotRedactedScalar[] | null;

export type LinkedInSnapshotRedactedRecordShape = Record<
  string,
  LinkedInSnapshotRedactedValue
>;

export interface LinkedInSnapshotFieldSummary {
  name: string;
  types: LinkedInSnapshotValueType[];
  presentCount: number;
}

export interface LinkedInSnapshotSchemaSummary {
  recordsRead: number;
  fields: LinkedInSnapshotFieldSummary[];
  recordShapes: LinkedInSnapshotRedactedRecordShape[];
}

function valueType(value: unknown): LinkedInSnapshotValueType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  switch (typeof value) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "object":
      return "object";
    default:
      return "string";
  }
}

function redactString(value: string): LinkedInSnapshotRedactedScalar {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "<empty-string>";
  if (/^urn:/i.test(trimmed)) return "<urn>";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "<email>";
  if (/^https?:\/\//i.test(trimmed)) return "<url>";
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(trimmed)) {
    return "<timestamp>";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return "<year-month-day>";
  if (/^\d{4}-\d{2}$/.test(trimmed)) return "<year-month>";
  if (/^\d{4}$/.test(trimmed)) return "<year>";
  if (
    /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}$/i.test(
      trimmed,
    )
  ) {
    return "<month-year>";
  }
  return "<string>";
}

function redactArrayElement(value: unknown): LinkedInSnapshotRedactedScalar {
  if (value === null) return "<null>";
  if (Array.isArray(value)) return "<array>";
  switch (typeof value) {
    case "boolean":
      return "<boolean>";
    case "number":
      return "<number>";
    case "object":
      return "<object>";
    case "string":
      return redactString(value);
    default:
      return "<string>";
  }
}

function redactValue(value: unknown): LinkedInSnapshotRedactedValue {
  if (value === null) return null;
  if (Array.isArray(value)) {
    return [...new Set(value.map(redactArrayElement))].sort();
  }
  switch (typeof value) {
    case "boolean":
      return "<boolean>";
    case "number":
      return "<number>";
    case "object":
      return "<object>";
    case "string":
      return redactString(value);
    default:
      return "<string>";
  }
}

function redactRecord(
  record: LinkedInSnapshotRecord,
): LinkedInSnapshotRedactedRecordShape {
  return Object.fromEntries(
    Object.entries(record)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => [name, redactValue(value)]),
  );
}

/** Summarize source shape without returning any member values or nested object keys. */
export function summarizeLinkedInSnapshotSchema(
  records: LinkedInSnapshotRecord[],
): LinkedInSnapshotSchemaSummary {
  const fields = new Map<
    string,
    { types: Set<LinkedInSnapshotValueType>; presentCount: number }
  >();
  const recordShapes = new Map<string, LinkedInSnapshotRedactedRecordShape>();

  for (const record of records) {
    for (const [name, value] of Object.entries(record)) {
      const field = fields.get(name) ?? {
        types: new Set<LinkedInSnapshotValueType>(),
        presentCount: 0,
      };
      field.types.add(valueType(value));
      field.presentCount += 1;
      fields.set(name, field);
    }

    const redacted = redactRecord(record);
    const signature = JSON.stringify(redacted);
    if (!recordShapes.has(signature)) recordShapes.set(signature, redacted);
  }

  return {
    recordsRead: records.length,
    fields: [...fields.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, field]) => ({
        name,
        types: [...field.types].sort(),
        presentCount: field.presentCount,
      })),
    recordShapes: [...recordShapes.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, shape]) => shape),
  };
}
