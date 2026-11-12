import {
  publishAssetDefinitionSchema,
  type PublishAssetDefinition,
} from "@brains/contracts";

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
