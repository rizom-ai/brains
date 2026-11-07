import {
  RICH_DOMAINS,
  type LinkedInClient,
  type LinkedInSnapshotRecord,
} from "./linkedin-client";

type ValueType = "array" | "boolean" | "null" | "number" | "object" | "string";

/** A value reduced to what it is, never what it says. */
type Redacted = string | string[] | null;

export interface SnapshotFieldSummary {
  name: string;
  types: ValueType[];
  presentCount: number;
}

export interface SnapshotShapeSummary {
  recordsRead: number;
  fields: SnapshotFieldSummary[];
  recordShapes: Record<string, Redacted>[];
}

const MONTH_YEAR =
  /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}$/i;

/** Ordered: the first pattern a string matches names its placeholder. */
const STRING_FORMS: readonly [RegExp, string][] = [
  [/^$/, "<empty-string>"],
  [/^urn:/i, "<urn>"],
  [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "<email>"],
  [/^https?:\/\//i, "<url>"],
  [/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/, "<timestamp>"],
  [/^\d{4}-\d{2}-\d{2}$/, "<year-month-day>"],
  [/^\d{4}-\d{2}$/, "<year-month>"],
  [/^\d{4}$/, "<year>"],
  [MONTH_YEAR, "<month-year>"],
];

function valueType(value: unknown): ValueType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const type = typeof value;
  return type === "boolean" || type === "number" || type === "object"
    ? type
    : "string";
}

function redactScalar(value: unknown): string {
  if (typeof value !== "string") return `<${valueType(value)}>`;
  const trimmed = value.trim();
  return (
    STRING_FORMS.find(([pattern]) => pattern.test(trimmed))?.[1] ?? "<string>"
  );
}

function redact(value: unknown): Redacted {
  if (value === null) return null;
  if (Array.isArray(value)) return [...new Set(value.map(redactScalar))].sort();
  return redactScalar(value);
}

function byName<T>([left]: [string, T], [right]: [string, T]): number {
  return left.localeCompare(right);
}

/**
 * The shape of snapshot records, for writing fixtures: field names, value
 * types, how often each field occurs, and each distinct record form with
 * every value replaced by a placeholder. Never a member value or a nested key.
 */
export function summarizeSnapshotShape(
  records: readonly LinkedInSnapshotRecord[],
): SnapshotShapeSummary {
  const entries = records.flatMap((record) => Object.entries(record));
  const names = [...new Set(entries.map(([name]) => name))].sort();
  const fields = names.map((name) => {
    const values = entries.filter(([field]) => field === name);
    return {
      name,
      types: [...new Set(values.map(([, value]) => valueType(value)))].sort(),
      presentCount: values.length,
    };
  });
  const shapes = new Map(
    records.map((record) => {
      const shape = Object.fromEntries(
        Object.entries(record)
          .sort(byName)
          .map(([name, value]) => [name, redact(value)]),
      );
      return [JSON.stringify(shape), shape] as const;
    }),
  );
  return {
    recordsRead: records.length,
    fields,
    recordShapes: [...shapes].sort(byName).map(([, shape]) => shape),
  };
}

/** Shape summaries of every rich domain, keyed by domain, in fixed order. */
export async function inspectRichDomains(
  client: LinkedInClient,
): Promise<Record<string, SnapshotShapeSummary>> {
  const summaries = await Promise.all(
    RICH_DOMAINS.map(
      async (domain) =>
        [
          domain,
          summarizeSnapshotShape(await client.fetchDomain(domain)),
        ] as const,
    ),
  );
  return Object.fromEntries(summaries);
}
