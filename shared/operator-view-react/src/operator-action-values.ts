import type { OperatorJsonValue } from "./operator-view-host";

export function isJsonValue(value: unknown): value is OperatorJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value).every(isJsonValue);
}

export function plainRecord(
  value: unknown,
): Partial<Record<string, OperatorJsonValue>> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const result: Record<string, OperatorJsonValue> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!isJsonValue(candidate)) return undefined;
    result[key] = candidate;
  }
  return result;
}
