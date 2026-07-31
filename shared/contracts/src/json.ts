export type JsonPrimitive = null | boolean | number | string;

export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

/** A JSON document with an object at its root. */
export interface JsonObject {
  [key: string]: JsonValue;
}

type IsJsonValueMember<
  T,
  Depth extends readonly unknown[],
> = T extends JsonPrimitive
  ? true
  : T extends readonly (infer Item)[]
    ? IsJsonValue<Item, [...Depth, unknown]>
    : T extends (...args: never[]) => unknown
      ? false
      : T extends object
        ? [keyof T] extends [never]
          ? false
          : string extends keyof T
            ? T extends JsonObject
              ? true
              : false
            : false extends {
                  [K in keyof T]-?: IsJsonValue<T[K], [...Depth, unknown]>;
                }[keyof T]
              ? false
              : true
        : false;

/**
 * Whether a type is composed entirely of JSON values.
 * Types deeper than 32 levels fail closed to cap compiler recursion.
 */
export type IsJsonValue<
  T,
  Depth extends readonly unknown[] = [],
> = Depth["length"] extends 32
  ? false
  : undefined extends T
    ? false
    : false extends IsJsonValueMember<T, Depth>
      ? false
      : true;

/** Resolves to `unknown` for JSON-object output without `undefined`, else `never`. */
export type JsonObjectOutputGuard<T> = [T] extends [readonly unknown[]]
  ? never
  : [T] extends [object]
    ? IsJsonValue<T> extends true
      ? unknown
      : never
    : never;
