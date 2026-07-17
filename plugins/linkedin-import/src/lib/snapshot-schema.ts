import type { LinkedInSnapshotRecord } from "./linkedin-client";

export type LinkedInSnapshotValueType =
  "array" | "boolean" | "null" | "number" | "object" | "string";

export interface LinkedInSnapshotFieldSummary {
  name: string;
  types: LinkedInSnapshotValueType[];
  presentCount: number;
}

export interface LinkedInSnapshotSchemaSummary {
  recordsRead: number;
  fields: LinkedInSnapshotFieldSummary[];
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

/** Summarize source shape without returning any member values. */
export function summarizeLinkedInSnapshotSchema(
  records: LinkedInSnapshotRecord[],
): LinkedInSnapshotSchemaSummary {
  const fields = new Map<
    string,
    { types: Set<LinkedInSnapshotValueType>; presentCount: number }
  >();

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
  };
}
