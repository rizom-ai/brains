import { isPlainRecord } from "@brains/utils/predicates";

type JsonSchema = Record<string, unknown>;

/** Keywords strict mode has no form for: a schema using one stays as it is. */
const UNSUPPORTED = [
  "propertyNames",
  "patternProperties",
  "allOf",
  "not",
  "if",
];

const nullSchema = { type: "null" };

/** Keywords whose values are schemas; every other keyword's value is data. */
const SCHEMA_LISTS = ["anyOf", "oneOf", "prefixItems"];
const SCHEMA_MAPS = ["$defs", "definitions"];

function acceptsNull(schema: unknown): boolean {
  if (!isPlainRecord(schema)) return false;
  if (schema["type"] === "null") return true;
  if (Array.isArray(schema["type"]) && schema["type"].includes("null"))
    return true;
  const branches = schema["anyOf"] ?? schema["oneOf"];
  return Array.isArray(branches) && branches.some(acceptsNull);
}

/** An object's own keys may be open: a map, or unknown keys kept. */
function isOpenObject(schema: JsonSchema): boolean {
  const additional = schema["additionalProperties"];
  return additional !== undefined && additional !== false;
}

/** The strict form of a keyword's value: a schema, schemas, or data as is. */
function strictValue(key: string, value: unknown): unknown {
  if (key === "items") return strictNode(value);
  if (SCHEMA_LISTS.includes(key)) {
    if (!Array.isArray(value)) return undefined;
    const schemas = value.map(strictNode);
    return schemas.includes(undefined) ? undefined : schemas;
  }
  if (SCHEMA_MAPS.includes(key)) {
    if (!isPlainRecord(value)) return undefined;
    const entries = Object.entries(value).map(
      ([name, schema]) => [name, strictNode(schema)] as const,
    );
    return entries.some(([, schema]) => schema === undefined)
      ? undefined
      : Object.fromEntries(entries);
  }
  return value;
}

function strictNode(schema: unknown): unknown {
  if (!isPlainRecord(schema)) return schema;
  if (UNSUPPORTED.some((keyword) => keyword in schema)) return undefined;
  if (isOpenObject(schema)) return undefined;

  const out: JsonSchema = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "properties" || key === "required") continue;
    // A discriminated union's branches exclude each other by their
    // discriminator, so anyOf says the same; strict mode only has anyOf.
    const target = key === "oneOf" ? "anyOf" : key;
    const converted = strictValue(key, value);
    if (converted === undefined) return undefined;
    out[target] = converted;
  }

  const properties = schema["properties"];
  if (schema["type"] !== "object" && !isPlainRecord(properties)) return out;
  const required = new Set(
    Array.isArray(schema["required"]) ? schema["required"] : [],
  );
  const strictProperties: JsonSchema = {};
  for (const [name, property] of Object.entries(
    isPlainRecord(properties) ? properties : {},
  )) {
    const converted = strictNode(property);
    if (converted === undefined) return undefined;
    // Strict mode lists every property: one the caller may leave out is
    // listed as accepting null, which stands for leaving it out.
    strictProperties[name] =
      required.has(name) || acceptsNull(converted)
        ? converted
        : { anyOf: [converted, nullSchema] };
  }
  return {
    ...out,
    type: "object",
    properties: strictProperties,
    required: Object.keys(strictProperties),
    additionalProperties: false,
  };
}

/**
 * A tool's input schema in the form OpenAI's strict mode holds the model to:
 * every object closed, every property listed, and one the caller may leave
 * out accepting null instead. Undefined when the schema needs a form strict
 * mode cannot express, such as a map of any keys; that tool stays as it is.
 * The tool's own schema still validates every call.
 */
export function toStrictModelSchema(
  schema: JsonSchema,
): JsonSchema | undefined {
  const strict = strictNode(schema);
  return isPlainRecord(strict) ? strict : undefined;
}

/** The branches of a union a value can be, by the constants it matches. */
function matchingBranches(branches: unknown[], value: unknown): unknown[] {
  if (!isPlainRecord(value)) return branches;
  return branches.filter((branch) => {
    if (!isPlainRecord(branch) || !isPlainRecord(branch["properties"]))
      return true;
    return Object.entries(branch["properties"]).every(
      ([name, property]) =>
        !isPlainRecord(property) ||
        !("const" in property) ||
        value[name] === undefined ||
        value[name] === property["const"],
    );
  });
}

/**
 * A strict call with every null the model wrote for a left-out field
 * dropped, read against the tool's own schema: a null that field accepts
 * stays.
 */
export function dropModelNulls(value: unknown, schema: unknown): unknown {
  if (!isPlainRecord(schema)) return value;
  const branches = schema["anyOf"] ?? schema["oneOf"];
  if (Array.isArray(branches)) {
    const [branch] = matchingBranches(branches, value);
    return branch === undefined ? value : dropModelNulls(value, branch);
  }
  if (Array.isArray(value))
    return value.map((item) => dropModelNulls(item, schema["items"]));
  if (!isPlainRecord(value) || !isPlainRecord(schema["properties"]))
    return value;
  const properties = schema["properties"];
  const required = new Set(
    Array.isArray(schema["required"]) ? schema["required"] : [],
  );
  return Object.fromEntries(
    Object.entries(value).flatMap(([name, field]) => {
      const property = properties[name];
      if (field === null && !required.has(name) && !acceptsNull(property))
        return [];
      return [[name, dropModelNulls(field, property)]];
    }),
  );
}
