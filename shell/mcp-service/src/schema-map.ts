import { z } from "@brains/utils/zod";
import { closestName } from "@brains/utils/string-utils";
import type { ToolInputSchema } from "./types";

type ToolSchemaField = ToolInputSchema[string];

interface SchemaInternals {
  _zod?: {
    def?: {
      type?: string;
      innerType?: ToolSchemaField;
    };
  };
  unwrap?: () => ToolSchemaField;
  removeDefault?: () => ToolSchemaField;
}

function isSchemaWithInternals(
  schema: ToolSchemaField,
): schema is ToolSchemaField & SchemaInternals {
  return "_zod" in schema;
}

function getSchemaInternals(schema: ToolSchemaField): SchemaInternals {
  if (!isSchemaWithInternals(schema)) {
    throw new Error(
      "Tool input schemas must use the blessed Zod 4 export from @rizom/brain.",
    );
  }
  return schema;
}

function getTypeName(schema: ToolSchemaField): string | undefined {
  return getSchemaInternals(schema)._zod?.def?.type;
}

function getInnerType(schema: ToolSchemaField): ToolSchemaField | undefined {
  const internals = getSchemaInternals(schema);
  return (
    internals._zod?.def?.innerType ??
    internals.unwrap?.() ??
    internals.removeDefault?.()
  );
}

/**
 * Get the inner type of a Zod schema, unwrapping optional/default wrappers.
 */
function unwrapType(schema: ToolSchemaField): ToolSchemaField {
  const typeName = getTypeName(schema);
  if (typeName === "optional") {
    const inner = getInnerType(schema);
    return inner ? unwrapType(inner) : schema;
  }
  if (typeName === "default") {
    const inner = getInnerType(schema);
    return inner ? unwrapType(inner) : schema;
  }
  return schema;
}

/**
 * Check if a schema field is required (not optional, no default).
 */
function isRequired(schema: ToolSchemaField): boolean {
  const typeName = getTypeName(schema);
  return !["optional", "default"].includes(typeName ?? "");
}

/**
 * Coerce a string value to the type expected by the schema.
 */
function coerceValue(value: string, schema: ToolSchemaField): unknown {
  const innerTypeName = getTypeName(unwrapType(schema));

  if (innerTypeName === "number") {
    return Number(value);
  }
  if (innerTypeName === "boolean") {
    return value === "true";
  }
  return value;
}

/**
 * Map CLI positional args and flags to tool input using the tool's inputSchema.
 *
 * - Positional args map to schema fields in declaration order
 * - Flags (--name value) map to schema fields by name
 * - Defaults from Zod schema apply for missing optional fields
 * - String values are coerced to number/boolean when schema expects it
 */
export function mapArgsToInput(
  inputSchema: ToolInputSchema,
  args: string[],
  flags: Record<string, unknown>,
): Record<string, unknown> {
  const fieldNames = Object.keys(inputSchema);
  const result: Record<string, unknown> = {};

  // Map positional args to fields in order
  let argIdx = 0;
  for (const name of fieldNames) {
    const fieldSchema = inputSchema[name];
    if (!fieldSchema) continue;

    // Check if this field was provided as a flag
    if (name in flags) {
      const value = flags[name];
      result[name] =
        typeof value === "string" ? coerceValue(value, fieldSchema) : value;
      continue;
    }

    // Map next positional arg
    if (argIdx < args.length) {
      const arg = args[argIdx];
      if (arg !== undefined) {
        result[name] = coerceValue(arg, fieldSchema);
      }
      argIdx++;
      continue;
    }

    // No arg and no flag — let Zod defaults handle it
    if (!isRequired(fieldSchema)) {
      // Parse undefined through the schema to get defaults
      const parsed = z.safeParse(fieldSchema, undefined);
      if (parsed.success && parsed.data !== undefined) {
        result[name] = parsed.data;
      }
    }
  }

  return result;
}

/** An input field as `brain <command> --<field>` sets it. */
export interface CliToolField {
  name: string;
  /** A switch: `--<field>` alone sets it, and it takes no value. */
  boolean: boolean;
}

/** The fields of a tool input schema that CLI flags can set. */
export function cliToolFields(inputSchema: ToolInputSchema): CliToolField[] {
  return Object.entries(inputSchema).map(([name, schema]) => ({
    name,
    boolean: getTypeName(unwrapType(schema)) === "boolean",
  }));
}

/** The input field the CLI's `--preview` flag selects the preview of. */
const PREVIEW_FIELD = "environment";

function unknownFlag(
  command: string,
  flag: string,
  detail: string,
): { error: string } {
  return {
    error: `Unknown flag --${flag} for \`brain ${command}\`${detail} Run \`brain ${command} --help\` for the flags it accepts.`,
  };
}

/** Why a flag cannot set the field it names, if it cannot. */
function flagProblem(
  command: string,
  fields: ReadonlyMap<string, CliToolField>,
  name: string,
  value: unknown,
): { error: string } | undefined {
  const field = fields.get(name);
  if (!field) {
    const suggestion = closestName(name, [...fields.keys()]);
    return unknownFlag(
      command,
      name,
      suggestion ? `. Did you mean --${suggestion}?` : ".",
    );
  }
  if (
    field.boolean &&
    typeof value === "string" &&
    !/^(true|false)$/.test(value)
  ) {
    return {
      error: `--${name} is a switch and takes no value, but got "${value}". Put it after \`brain ${command}\`'s arguments, or write --${name}=true.`,
    };
  }
  if (!field.boolean && value === true) {
    return {
      error: `--${name} needs a value: \`brain ${command} --${name} <value>\`.`,
    };
  }
  return undefined;
}

/**
 * Check a brain command's flags against its tool's input fields, before
 * `mapArgsToInput` sets each field from the flag of the same name.
 *
 * - `--<field> <value>` sets a field; a switch takes `--<field>` alone.
 * - `--preview` names no field (unless the tool has one by that name): it
 *   asks for the preview of the tool's `environment`, as `brain build
 *   preview` does, and is refused by a tool without one.
 * - Any other flag is refused, suggesting the nearest field.
 */
export function resolveCliToolFlags(
  command: string,
  fields: readonly CliToolField[],
  flags: Record<string, unknown>,
): { flags: Record<string, unknown> } | { error: string } {
  const byName = new Map(fields.map((field) => [field.name, field]));
  const previewAsEnvironment =
    flags["preview"] === true && !byName.has("preview");
  if (previewAsEnvironment && !byName.has(PREVIEW_FIELD)) {
    return unknownFlag(
      command,
      "preview",
      ": it has no environment to preview.",
    );
  }

  const entries = Object.entries(flags).filter(
    ([name]) => !(previewAsEnvironment && name === "preview"),
  );
  const problem = entries
    .map(([name, value]) => flagProblem(command, byName, name, value))
    .find((found) => found !== undefined);
  if (problem) return problem;

  const resolved = Object.fromEntries(entries);
  return {
    flags: previewAsEnvironment
      ? { ...resolved, [PREVIEW_FIELD]: "preview" }
      : resolved,
  };
}
