import type { PublishMediaData } from "@brains/contracts";

export interface AttachmentResolveRequest {
  sourceEntityType: string;
  sourceEntityId: string;
  attachmentType: string;
}

export interface AttachmentProviderMetadata {
  outputEntityType: "image" | "document";
  targetField?: "coverImageId" | "ogImageId";
}

export interface AttachmentProvider {
  metadata?: AttachmentProviderMetadata;
  resolve(
    request: AttachmentResolveRequest,
  ): Promise<PublishMediaData | undefined> | PublishMediaData | undefined;
}

/**
 * Attachment namespace — source-derived publish artifacts.
 * Source plugins register providers; publishers resolve by semantic attachment type.
 */
export interface IAttachmentsNamespace {
  /** Register an attachment provider for a source entity type and semantic attachment type. */
  register: (
    sourceEntityType: string,
    attachmentType: string,
    provider: AttachmentProvider,
  ) => () => void;

  /** Resolve a source-derived attachment if a provider is available. */
  resolve: (
    request: AttachmentResolveRequest,
  ) => Promise<PublishMediaData | undefined>;

  /** Check whether a provider exists for the requested source/attachment type. */
  hasProvider: (sourceEntityType: string, attachmentType: string) => boolean;

  /** Get registered provider capability metadata, if declared. */
  getProviderMetadata: (
    sourceEntityType: string,
    attachmentType: string,
  ) => AttachmentProviderMetadata | undefined;
}

export function createAttachmentsNamespace(
  registry: AttachmentRegistry,
): IAttachmentsNamespace {
  return {
    register: (
      sourceEntityType: string,
      attachmentType: string,
      provider: AttachmentProvider,
    ): (() => void) => {
      return registry.register(sourceEntityType, attachmentType, provider);
    },
    resolve: (
      request: AttachmentResolveRequest,
    ): Promise<PublishMediaData | undefined> => {
      return registry.resolve(request);
    },
    hasProvider: (
      sourceEntityType: string,
      attachmentType: string,
    ): boolean => {
      return registry.has(sourceEntityType, attachmentType);
    },
    getProviderMetadata: (
      sourceEntityType: string,
      attachmentType: string,
    ): AttachmentProviderMetadata | undefined => {
      return registry.getMetadata(sourceEntityType, attachmentType);
    },
  };
}

export class AttachmentRegistry {
  private static instance: AttachmentRegistry | null = null;

  private readonly providers = new Map<
    string,
    Map<string, AttachmentProvider>
  >();

  public static getInstance(): AttachmentRegistry {
    AttachmentRegistry.instance ??= new AttachmentRegistry();
    return AttachmentRegistry.instance;
  }

  public static resetInstance(): void {
    AttachmentRegistry.instance = null;
  }

  public static createFresh(): AttachmentRegistry {
    return new AttachmentRegistry();
  }

  private constructor() {}

  public register(
    sourceEntityType: string,
    attachmentType: string,
    provider: AttachmentProvider,
  ): () => void {
    const providersByAttachmentType =
      this.getOrCreateSourceProviders(sourceEntityType);
    providersByAttachmentType.set(attachmentType, provider);

    return () => {
      this.unregister(sourceEntityType, attachmentType);
    };
  }

  public async resolve(
    request: AttachmentResolveRequest,
  ): Promise<PublishMediaData | undefined> {
    const provider = this.get(request.sourceEntityType, request.attachmentType);
    if (!provider) {
      return undefined;
    }
    return provider.resolve(request);
  }

  public get(
    sourceEntityType: string,
    attachmentType: string,
  ): AttachmentProvider | undefined {
    return this.providers.get(sourceEntityType)?.get(attachmentType);
  }

  public has(sourceEntityType: string, attachmentType: string): boolean {
    return this.get(sourceEntityType, attachmentType) !== undefined;
  }

  public getMetadata(
    sourceEntityType: string,
    attachmentType: string,
  ): AttachmentProviderMetadata | undefined {
    return this.get(sourceEntityType, attachmentType)?.metadata;
  }

  public unregister(sourceEntityType: string, attachmentType: string): void {
    const providersByAttachmentType = this.providers.get(sourceEntityType);
    if (!providersByAttachmentType) {
      return;
    }

    providersByAttachmentType.delete(attachmentType);
    if (providersByAttachmentType.size === 0) {
      this.providers.delete(sourceEntityType);
    }
  }

  public getRegisteredAttachmentTypes(sourceEntityType: string): string[] {
    return Array.from(this.providers.get(sourceEntityType)?.keys() ?? []);
  }

  public clear(): void {
    this.providers.clear();
  }

  private getOrCreateSourceProviders(
    sourceEntityType: string,
  ): Map<string, AttachmentProvider> {
    const existing = this.providers.get(sourceEntityType);
    if (existing) {
      return existing;
    }

    const providersByAttachmentType = new Map<string, AttachmentProvider>();
    this.providers.set(sourceEntityType, providersByAttachmentType);
    return providersByAttachmentType;
  }
}
