import { toStrictModelSchema } from "@brains/ai-service";
import type { IEntityRegistry } from "@brains/entity-service";
import type { Tool } from "@brains/mcp-service";
import { z } from "@brains/utils/zod";
import { isPlainRecord } from "@brains/utils/predicates";
import {
  createInputSchema,
  createPreferredSourceInputSchema,
  updateInputSchema,
  updateOperationInputSchema,
  uploadsSourceInputSchema,
} from "./schemas";

type ToolInputSchema = Tool["inputSchema"];

type FieldRegistry = Pick<
  IEntityRegistry,
  | "ensureGroupingsCurrent"
  | "getAllEntityTypes"
  | "getEditableFieldsSchema"
  | "getCreateFieldsSchema"
>;

/** Which tool sets the fields: create also takes fields stated only then. */
type FieldsOn = "create" | "update";

function fieldsOn(
  registry: Pick<
    IEntityRegistry,
    "getEditableFieldsSchema" | "getCreateFieldsSchema"
  >,
  type: string,
  on: FieldsOn,
): z.ZodObject | undefined {
  return on === "create"
    ? registry.getCreateFieldsSchema(type)
    : registry.getEditableFieldsSchema(type);
}

/** A field's own value schema, without the optional or default around it. */
function valueOf(field: z.core.$ZodType): z.ZodType | undefined {
  if (
    field instanceof z.ZodOptional ||
    field instanceof z.ZodNullable ||
    field instanceof z.ZodDefault
  )
    return valueOf(field.unwrap());
  return field instanceof z.ZodType ? field : undefined;
}

function jsonOf(schema: z.ZodType): Record<string, unknown> | undefined {
  try {
    const { $schema: _draft, ...json }: Record<string, unknown> =
      z.toJSONSchema(schema, { target: "draft-7", io: "input" });
    return json;
  } catch {
    // A value with no JSON schema form, such as a custom check, cannot be
    // offered to the model as a typed change; that field is left out.
    return undefined;
  }
}

/** Whether a value can be written in a strict tool schema. */
function strictValue(json: Record<string, unknown>): boolean {
  return (
    toStrictModelSchema({
      type: "object",
      properties: { value: json },
      required: ["value"],
    }) !== undefined
  );
}

/**
 * The fields a model may change, as a list of `{ name, value }` changes: one
 * branch per field a caller may set on the registered entity types, its value
 * typed as each type declares the field. A field leaves the list when its
 * value is itself a map of any keys, which a strict schema cannot hold.
 * On update, a null value removes the field. Read from the registry each
 * time, so fields registered while the brain runs are offered too.
 */
export function fieldChangeListSchema(
  registry: FieldRegistry,
  options: { on: FieldsOn; omit?: string[] },
): z.ZodArray<z.ZodType> {
  const values = new Map<string, Map<string, z.ZodType>>();
  // The entity types that take each field, for the model to read.
  const takenBy = new Map<string, string[]>();
  const types = registry.getAllEntityTypes();
  for (const type of types) {
    const settable = fieldsOn(registry, type, options.on);
    for (const [name, field] of Object.entries(settable?.shape ?? {})) {
      if (options.omit?.includes(name)) continue;
      const value = valueOf(field);
      const json = value && jsonOf(value);
      if (!value || !json || !strictValue(json)) continue;
      const forName = values.get(name) ?? new Map<string, z.ZodType>();
      forName.set(JSON.stringify(json), value);
      values.set(name, forName);
      takenBy.set(name, [...(takenBy.get(name) ?? []), type]);
    }
  }
  // Fields whose values take the same schema share one change, naming
  // each of them: the same constraint, written once.
  const groups = new Map<string, { value: z.ZodType; names: string[] }>();
  for (const [name, forName] of values) {
    const [only, ...more] = [...forName.values()];
    if (!only) continue;
    const value = more.length > 0 ? z.union([only, ...more]) : only;
    const key = JSON.stringify(jsonOf(value));
    const group = groups.get(key) ?? { value, names: [] };
    group.names.push(name);
    groups.set(key, group);
  }
  const changes = [...groups.values()].map(({ value, names }) => {
    const [name, ...others] = names;
    const owners = names
      .map((field) => {
        const owning = takenBy.get(field) ?? [];
        return `${field} (${owning.length === types.length ? "every type" : owning.join(", ")})`;
      })
      .join("; ");
    return z.strictObject({
      name: (others.length > 0 && name !== undefined
        ? z.enum([name, ...others])
        : z.literal(name ?? "")
      ).describe(`The field, set only on the entity types named: ${owners}.`),
      value: options.on === "update" ? value.nullable() : value,
    });
  });
  const [first, ...rest] = changes;
  return z.array(
    first ? (rest.length > 0 ? z.union([first, ...rest]) : first) : z.never(),
  );
}

/** The map of fields a list of changes stands for. */
export function fieldsFromChanges(changes: unknown): Record<string, unknown> {
  return Object.fromEntries(
    (Array.isArray(changes) ? changes : []).flatMap((change) =>
      isPlainRecord(change) && typeof change["name"] === "string"
        ? [[change["name"], change["value"]]]
        : [],
    ),
  );
}

/**
 * Why a caller may not set some of these fields on an entity type: the
 * fields it names that the type keeps for itself, with those it can set.
 * Undefined when every field is one a caller can set. `allow` names fields
 * a tool handles apart from the frontmatter, such as visibility.
 */
export function uneditableFieldsError(
  registry: Pick<
    IEntityRegistry,
    "getEditableFieldsSchema" | "getCreateFieldsSchema"
  >,
  entityType: string,
  fields: Record<string, unknown> | undefined,
  options: { on: FieldsOn; allow: readonly string[] },
): string | undefined {
  if (!fields) return undefined;
  const { allow } = options;
  const editable = new Set(
    Object.keys(fieldsOn(registry, entityType, options.on)?.shape ?? {}),
  );
  const refused = Object.keys(fields).filter(
    (name) => !editable.has(name) && !allow.includes(name),
  );
  if (refused.length === 0) return undefined;
  const named = refused.map((name) => `"${name}"`).join(", ");
  const settable = [...editable].join(", ") || "none";
  return `A ${entityType} has no ${refused.length > 1 ? "fields" : "field"} ${named} a caller can set; its fields are ${settable}.`;
}

/** A record with its `fields` list, when it has one, as a map. */
function withFieldMap(input: Record<string, unknown>): Record<string, unknown> {
  return "fields" in input && input["fields"] !== undefined
    ? { ...input, fields: fieldsFromChanges(input["fields"]) }
    : input;
}

/**
 * system_create as the model writes it: its fields, and those of each
 * uploaded file, as lists of changes.
 */
export function createModelInput(
  registry: FieldRegistry,
): NonNullable<Tool["modelInput"]> {
  return {
    // Grouping fields come from a definitions entity, read when first needed.
    prepare: (): Promise<void> => registry.ensureGroupingsCurrent(),
    inputSchema: (): ToolInputSchema => {
      // Visibility is a parameter of its own on system_create.
      const changes = fieldChangeListSchema(registry, {
        on: "create",
        omit: ["visibility"],
      });
      const item = uploadsSourceInputSchema.shape.items.element;
      const uploads = uploadsSourceInputSchema.extend({
        items: z
          .array(
            item.extend({
              fields: changes
                .optional()
                .describe(
                  "Field changes the user stated for this file alone, one { name, value } per field, such as the date and address it was first published at: [{ name: 'publishedAt', value }, { name: 'canonicalUrl', value }]; facts shared by every file go in the top-level fields.",
                ),
            }),
          )
          .min(2)
          .max(20),
      });
      const [first, ...rest] = createPreferredSourceInputSchema.options.map(
        (option) => (option === uploadsSourceInputSchema ? uploads : option),
      );
      if (!first) throw new Error("system_create has no source branches");
      return {
        ...createInputSchema.shape,
        source: z
          .discriminatedUnion("kind", [first, ...rest])
          .describe(
            "Concrete source selector. Use exactly one source branch. For AI generation or source-derived artifacts, use system_generate instead.",
          ),
        fields: changes
          .optional()
          .describe(
            "Field changes for facts the user states outside the source text, one { name, value } per field, e.g. a post first published elsewhere: [{ name: 'status', value: 'published' }, { name: 'publishedAt', value: '2025-03-12' }, { name: 'canonicalUrl', value }]; the section a doc goes in, named exactly as the user names it: [{ name: 'section', value }]; the year a project began: [{ name: 'year', value }]. Never copy values from the text or its frontmatter; omit when nothing extra is stated.",
          ),
      };
    },
    toToolInput: (input): Record<string, unknown> => {
      const source = input["source"];
      return withFieldMap({
        ...input,
        ...(isPlainRecord(source) &&
          Array.isArray(source["items"]) && {
            source: {
              ...source,
              items: source["items"].map((item) =>
                isPlainRecord(item) ? withFieldMap(item) : item,
              ),
            },
          }),
      });
    },
  };
}

/** An optional field made required, its description kept. */
function required<T extends z.ZodType>(field: z.ZodOptional<T>): T {
  const inner = field.unwrap();
  return field.description ? inner.describe(field.description) : inner;
}

/**
 * system_update as the model writes it: one operation alone, a fields
 * operation as a list. Strict mode writes every key a shape shows, so each
 * operation is a shape of its own rather than one key of four.
 */
export function updateModelInput(
  registry: FieldRegistry,
): NonNullable<Tool["modelInput"]> {
  const { content, edits, source } = updateOperationInputSchema.shape;
  return {
    // Grouping fields come from a definitions entity, read when first needed.
    prepare: (): Promise<void> => registry.ensureGroupingsCurrent(),
    inputSchema: (): ToolInputSchema => ({
      ...updateInputSchema.shape,
      operation: z
        .union([
          z.strictObject({
            fields: fieldChangeListSchema(registry, { on: "update" }).describe(
              "Change frontmatter or metadata fields, one { name, value } per field changed. Use this for status, title, coverImageId, ogImageId, and metadata changes such as approving an agent. To set an existing image as an entity cover, change coverImageId to that image id. To remove a field, such as a cover image, give it the value null, not an empty string. Do not use fields for anchor-profile; anchor-profile updates require the content operation.",
            ),
          }),
          z.strictObject({ content: required(content) }),
          z.strictObject({ edits: required(edits) }),
          z.strictObject({ source: required(source) }),
        ])
        .describe("Exactly one update operation"),
    }),
    toToolInput: (input): Record<string, unknown> => {
      const operation = input["operation"];
      return isPlainRecord(operation)
        ? { ...input, operation: withFieldMap(operation) }
        : input;
    },
  };
}
