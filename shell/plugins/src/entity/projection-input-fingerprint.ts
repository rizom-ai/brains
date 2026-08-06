import { sha256Hex } from "@brains/utils/hash";

/** Deterministic SHA-256 fingerprint for a JSON-compatible projection input. */
export function computeProjectionInputFingerprint(input: unknown): string {
  return sha256Hex(stableProjectionInput(input));
}

function stableProjectionInput(
  value: unknown,
  ancestors: ReadonlySet<object> = new Set(),
): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Projection inputs cannot contain non-finite numbers");
    }
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new Error("Projection inputs cannot contain unsafe integers");
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new Error(`Projection inputs cannot contain ${typeof value} values`);
  }
  if (ancestors.has(value)) {
    throw new Error("Projection inputs cannot contain circular values");
  }

  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    return `[${value
      .map((item) => stableProjectionInput(item, nextAncestors))
      .join(",")}]`;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("Projection inputs must contain only plain JSON objects");
  }
  return `{${Object.entries(value)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, child]) =>
        `${JSON.stringify(key)}:${stableProjectionInput(child, nextAncestors)}`,
    )
    .join(",")}}`;
}
