import { z } from "@brains/utils/zod";

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
  mediaEntityType: z.ZodEnum<{ image: "image"; document: "document" }>;
  targetEntityField: z.ZodOptional<typeof publishAssetTargetFieldSchema>;
  requiredWhen: z.ZodOptional<
    z.ZodObject<{
      status: z.ZodOptional<z.ZodString>;
      visibility: z.ZodOptional<z.ZodString>;
    }>
  >;
  autoGenerate: z.ZodOptional<z.ZodBoolean>;
  requiredForPublish: z.ZodOptional<z.ZodBoolean>;
  jobType: z.ZodOptional<z.ZodString>;
}>;

export const publishAssetDefinitionSchema: PublishAssetDefinitionSchema =
  z.object({
    entityType: z.string().min(1),
    attachmentType: z.string().min(1),
    mediaEntityType: z.enum(["image", "document"]),
    targetEntityField: publishAssetTargetFieldSchema.optional(),
    requiredWhen: z
      .object({
        status: z.string().min(1).optional(),
        visibility: z.string().min(1).optional(),
      })
      .optional(),
    autoGenerate: z.boolean().optional(),
    requiredForPublish: z.boolean().optional(),
    jobType: z.string().min(1).optional(),
  });

export type PublishAssetDefinition = z.output<
  typeof publishAssetDefinitionSchema
>;
export type PublishAssetRequirement = NonNullable<
  PublishAssetDefinition["requiredWhen"]
>;

function getPublishAssetKey(input: {
  entityType: string;
  attachmentType: string;
}): string {
  return `${input.entityType}:${input.attachmentType}`;
}

export class PublishAssetRegistry {
  private readonly definitions = new Map<string, PublishAssetDefinition>();

  public static createFresh(): PublishAssetRegistry {
    return new PublishAssetRegistry();
  }

  private constructor() {}

  public register(definition: PublishAssetDefinition): () => void {
    const parsed = publishAssetDefinitionSchema.parse(definition);
    const key = getPublishAssetKey(parsed);
    this.definitions.set(key, parsed);
    return () => this.unregister(parsed.entityType, parsed.attachmentType);
  }

  public get(
    entityType: string,
    attachmentType: string,
  ): PublishAssetDefinition | undefined {
    return this.definitions.get(
      getPublishAssetKey({ entityType, attachmentType }),
    );
  }

  public list(entityType?: string): PublishAssetDefinition[] {
    const definitions = Array.from(this.definitions.values());
    return entityType
      ? definitions.filter((definition) => definition.entityType === entityType)
      : definitions;
  }

  public has(entityType: string, attachmentType: string): boolean {
    return this.get(entityType, attachmentType) !== undefined;
  }

  public unregister(entityType: string, attachmentType: string): void {
    this.definitions.delete(getPublishAssetKey({ entityType, attachmentType }));
  }

  public clear(): void {
    this.definitions.clear();
  }
}
