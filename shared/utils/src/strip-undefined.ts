/**
 * Drop the keys whose value is `undefined`, keeping the value types.
 *
 * Under `exactOptionalPropertyTypes`, assigning `undefined` to an optional
 * property is an error, so building an object with optional fields otherwise
 * means one `...(x !== undefined ? { x } : {})` spread per field — which also
 * evaluates `x` twice. Spread this instead:
 *
 *   return { id, ...definedFields({ url, entityType, entityId }) };
 */
export function definedFields<T extends object>(
  fields: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as { [K in keyof T]?: Exclude<T[K], undefined> };
}

export function stripUndefinedDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUndefinedDeep);
  }

  if (!value || typeof value !== "object") return value;
  if (value instanceof Uint8Array) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, stripUndefinedDeep(entryValue)]),
  );
}
