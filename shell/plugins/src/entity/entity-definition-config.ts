import type {
  EntityTypeClassification,
  EntityTypeConfig,
} from "@brains/entity-service";
import { entityActionPolicyRuleSchema } from "@brains/templates";
import { definedFields } from "@brains/utils/strip-undefined";
import { z } from "@brains/utils/zod";

/** Classification is a top-level declaration, so config never carries it. */
type DeclarableEntityTypeConfigKey = Exclude<
  keyof EntityTypeConfig,
  "classification"
>;

type SortFieldSchema = z.ZodObject<
  {
    field: z.ZodString;
    direction: z.ZodEnum<{ asc: "asc"; desc: "desc" }>;
    nullsFirst: z.ZodOptional<z.ZodBoolean>;
    nullsLast: z.ZodOptional<z.ZodBoolean>;
  },
  z.core.$strict
>;

type FieldNamesSchema = z.ZodOptional<z.ZodArray<z.ZodString>>;

const sortFieldSchema: SortFieldSchema = z.strictObject({
  field: z.string().min(1).max(100),
  direction: z.enum(["asc", "desc"]),
  nullsFirst: z.boolean().optional(),
  nullsLast: z.boolean().optional(),
});

const fieldNamesSchema: FieldNamesSchema = z
  .array(z.string().min(1))
  .optional();

/**
 * The entity-type settings a declaration may set: main's `EntityTypeConfig`
 * minus `classification`. Every key is optional, and an omitted key keeps
 * the runtime default.
 */
export const entityDefinitionConfigSchema: z.ZodObject<
  {
    weight: z.ZodOptional<z.ZodNumber>;
    embeddable: z.ZodOptional<z.ZodBoolean>;
    fullTextSearchable: z.ZodOptional<z.ZodBoolean>;
    includeInBroadSearch: z.ZodOptional<z.ZodBoolean>;
    binaryStorage: z.ZodOptional<
      z.ZodEnum<{ "data-url": "data-url"; asset: "asset" }>
    >;
    defaultSort: z.ZodOptional<z.ZodArray<SortFieldSchema>>;
    markdownImport: z.ZodOptional<z.ZodBoolean>;
    retiredFields: FieldNamesSchema;
    translatedFields: FieldNamesSchema;
    actionPolicy: z.ZodOptional<typeof entityActionPolicyRuleSchema>;
    projectionSource: z.ZodOptional<z.ZodBoolean>;
    projectionSourceRole: z.ZodOptional<
      z.ZodEnum<{
        canonical: "canonical";
        primary: "primary";
        secondary: "secondary";
        supporting: "supporting";
        ambient: "ambient";
        excluded: "excluded";
      }>
    >;
    containedIn: z.ZodOptional<z.ZodString>;
    publish: z.ZodOptional<
      z.ZodObject<{ publishStatuses: z.ZodArray<z.ZodString> }, z.core.$strict>
    >;
  },
  z.core.$strict
> = z.strictObject({
  weight: z.number().optional(),
  embeddable: z.boolean().optional(),
  fullTextSearchable: z.boolean().optional(),
  includeInBroadSearch: z.boolean().optional(),
  binaryStorage: z.enum(["data-url", "asset"]).optional(),
  defaultSort: z.array(sortFieldSchema).max(10).optional(),
  markdownImport: z.boolean().optional(),
  retiredFields: fieldNamesSchema,
  translatedFields: fieldNamesSchema,
  actionPolicy: entityActionPolicyRuleSchema.optional(),
  projectionSource: z.boolean().optional(),
  projectionSourceRole: z
    .enum([
      "canonical",
      "primary",
      "secondary",
      "supporting",
      "ambient",
      "excluded",
    ])
    .optional(),
  containedIn: z.string().min(1).optional(),
  publish: z
    .strictObject({ publishStatuses: z.array(z.string().min(1)) })
    .optional(),
} satisfies Record<DeclarableEntityTypeConfigKey, z.ZodType>);

export type EntityDefinitionConfig = z.input<
  typeof entityDefinitionConfigSchema
>;

/**
 * The registration config for a declared type: its classification plus the
 * declared settings, validated and copied so later edits to the author's
 * object cannot reach the registry.
 */
export function entityTypeConfigFor(
  classification: EntityTypeClassification,
  config: EntityDefinitionConfig | undefined,
): EntityTypeConfig {
  const { defaultSort, actionPolicy, ...settings } =
    entityDefinitionConfigSchema.parse(config ?? {});
  return {
    classification,
    ...definedFields({
      ...settings,
      defaultSort: defaultSort?.map(({ field, direction, ...nulls }) => ({
        field,
        direction,
        ...definedFields(nulls),
      })),
      actionPolicy: actionPolicy && definedFields(actionPolicy),
    }),
  };
}

type ScheduledGenerationSchema = z.ZodObject<
  {
    from: z.ZodObject<
      {
        entityType: z.ZodString;
        status: z.ZodOptional<z.ZodString>;
        limit: z.ZodNumber;
      },
      z.core.$strict
    >;
    mode: z.ZodEnum<{ each: "each"; batch: "batch" }>;
  },
  z.core.$strict
>;

/**
 * Where a scheduled generation takes its material from when the content
 * pipeline asks for one and nothing says what to write about.
 */
export const entityScheduledGenerationSchema: ScheduledGenerationSchema =
  z.strictObject({
    from: z.strictObject({
      /** A type, not a package: the material is a fact about the content. */
      entityType: z.string().min(1),
      /** The metadata status a source must have. */
      status: z.string().min(1).optional(),
      limit: z.number().int().min(1).max(100),
    }),
    /** `each` writes from one source not yet written from; `batch` from all. */
    mode: z.enum(["each", "batch"]),
  });

export type EntityScheduledGenerationDeclaration = z.input<
  typeof entityScheduledGenerationSchema
>;
