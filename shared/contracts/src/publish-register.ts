import { z } from "@brains/utils/zod";
import { defineBusContract, type BusContract } from "./bus-contract";
import type { PublishProvider } from "./publish-types";

export const publishExecutionModeSchema: z.ZodEnum<{ provider: "provider" }> =
  z.enum(["provider"]);

export type PublishExecutionMode = z.output<typeof publishExecutionModeSchema>;

type PublishConfigSchema = z.ZodObject<
  {
    executionMode: z.ZodOptional<typeof publishExecutionModeSchema>;
    publishResultIdField: z.ZodOptional<z.ZodString>;
    publishTimestampField: z.ZodOptional<z.ZodString>;
    enabled: z.ZodOptional<z.ZodBoolean>;
  },
  z.core.$strict
>;

/** How content-pipeline publishes one entity type. */
export const publishConfigSchema: PublishConfigSchema = z
  .object({
    /** Publishing execution mode. Only provider execution is supported. */
    executionMode: publishExecutionModeSchema.optional(),

    /** Optional metadata/frontmatter field for storing provider result IDs. */
    publishResultIdField: z.string().min(1).optional(),

    /** Optional metadata/frontmatter field for storing publish timestamps. */
    publishTimestampField: z.string().min(1).optional(),

    /** Whether this entity type is enabled for publishing */
    enabled: z.boolean().optional(),
  })
  .strict();

export type PublishConfig = z.output<typeof publishConfigSchema>;
export type PublishConfigInput = z.input<typeof publishConfigSchema>;

function isPublishProvider(value: unknown): value is PublishProvider {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "publish" in value &&
    typeof value.publish === "function"
  );
}

type PublishProviderSchema = z.ZodCustom<PublishProvider, PublishProvider>;

/** A live provider object; the bus is in-process, so it travels as is. */
export const publishProviderSchema: PublishProviderSchema =
  z.custom<PublishProvider>(isPublishProvider);

type PublishRegisterSchema = z.ZodObject<{
  entityType: z.ZodString;
  provider: z.ZodOptional<PublishProviderSchema>;
  config: z.ZodOptional<PublishConfigSchema>;
}>;

export const publishRegisterSchema: PublishRegisterSchema = z.object({
  entityType: z.string(),
  provider: publishProviderSchema.optional(),
  config: publishConfigSchema.optional(),
});

export type PublishRegisterPayload = z.input<typeof publishRegisterSchema>;

/** An entity plugin hands content-pipeline the provider that publishes its type. */
export const publishRegisterContract: BusContract<
  PublishRegisterSchema,
  z.ZodVoid,
  "command"
> = defineBusContract({
  channel: "publish:register",
  request: publishRegisterSchema,
  response: z.void(),
  delivery: "command",
});

type PublishAssetFieldReferenceSchema = z.ZodObject<{
  location: z.ZodEnum<{ metadata: "metadata"; frontmatter: "frontmatter" }>;
  field: z.ZodString;
}>;

export const publishAssetTargetFieldSchema: z.ZodUnion<
  [z.ZodString, PublishAssetFieldReferenceSchema]
> = z.union([
  z.string().min(1),
  z.object({
    location: z.enum(["metadata", "frontmatter"]),
    field: z.string().min(1),
  }),
]);

export type PublishAssetTargetField = z.output<
  typeof publishAssetTargetFieldSchema
>;
export type PublishAssetFieldReference = Exclude<
  PublishAssetTargetField,
  string
>;

type PublishAssetDefinitionSchema = z.ZodObject<{
  entityType: z.ZodString;
  attachmentType: z.ZodString;
  mediaEntityType: z.ZodEnum<{ image: "image" }>;
  targetEntityField: z.ZodOptional<typeof publishAssetTargetFieldSchema>;
  requiredWhen: z.ZodOptional<
    z.ZodObject<{
      status: z.ZodOptional<z.ZodString>;
      visibility: z.ZodOptional<z.ZodString>;
    }>
  >;
  autoGenerate: z.ZodOptional<z.ZodBoolean>;
  requiredForPublish: z.ZodOptional<z.ZodBoolean>;
}>;

export const publishAssetDefinitionSchema: PublishAssetDefinitionSchema =
  z.object({
    entityType: z.string().min(1),
    attachmentType: z.string().min(1),
    mediaEntityType: z.enum(["image"]),
    targetEntityField: publishAssetTargetFieldSchema.optional(),
    requiredWhen: z
      .object({
        status: z.string().min(1).optional(),
        visibility: z.string().min(1).optional(),
      })
      .optional(),
    autoGenerate: z.boolean().optional(),
    requiredForPublish: z.boolean().optional(),
  });

export type PublishAssetDefinition = z.output<
  typeof publishAssetDefinitionSchema
>;
export type PublishAssetRequirement = NonNullable<
  PublishAssetDefinition["requiredWhen"]
>;

/** An entity plugin declares an asset its entities need before they publish. */
export const publishAssetRegisterContract: BusContract<
  PublishAssetDefinitionSchema,
  z.ZodVoid,
  "command"
> = defineBusContract({
  channel: "publish-assets:register",
  request: publishAssetDefinitionSchema,
  response: z.void(),
  delivery: "command",
});
