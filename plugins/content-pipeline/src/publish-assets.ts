import { z } from "@brains/utils/zod";

export const publishAssetTargetFieldSchema = z.union([
  z.string().min(1),
  z.object({
    location: z.enum(["metadata", "frontmatter"]),
    field: z.string().min(1),
  }),
]);

export type PublishAssetTargetField = z.infer<
  typeof publishAssetTargetFieldSchema
>;

export const publishAssetDefinitionSchema = z.object({
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

export type PublishAssetDefinition = z.infer<
  typeof publishAssetDefinitionSchema
>;

function getPublishAssetKey(input: {
  entityType: string;
  attachmentType: string;
}): string {
  return `${input.entityType}:${input.attachmentType}`;
}

export class PublishAssetRegistry {
  private static instance: PublishAssetRegistry | null = null;

  private readonly definitions = new Map<string, PublishAssetDefinition>();

  public static getInstance(): PublishAssetRegistry {
    PublishAssetRegistry.instance ??= new PublishAssetRegistry();
    return PublishAssetRegistry.instance;
  }

  public static resetInstance(): void {
    PublishAssetRegistry.instance = null;
  }

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
