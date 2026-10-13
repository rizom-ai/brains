import type { RuntimeOperatorScalar } from "@brains/plugins";

export function displayScalar(value: RuntimeOperatorScalar): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value);
}

export function displayCell(
  value: RuntimeOperatorScalar | readonly string[] | undefined,
): string {
  return isStringArray(value)
    ? value.join(", ")
    : displayScalar(value === undefined ? null : value);
}
