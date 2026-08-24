/** Convert a canonical non-negative integer query value before schema bounds. */
export function queryInteger(value: unknown): unknown {
  if (typeof value !== "string" || !/^\d+$/u.test(value)) return value;
  return Number(value);
}
