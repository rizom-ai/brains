/**
 * Schema-validated handlers may return immutable arrays and records: validation
 * reads these values, it does not require the author to make them mutable.
 * Preserve tuple positions, literals, optional fields, and opaque object types.
 */
export type SchemaReturn<T> = T extends readonly unknown[]
  ? { readonly [K in keyof T]: SchemaReturn<T[K]> }
  : T extends Record<string, unknown>
    ? { [K in keyof T]: SchemaReturn<T[K]> }
    : T;
