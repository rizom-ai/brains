import type { PublishMediaData } from "@brains/contracts";
import { z } from "@brains/utils/zod";

export interface AttachmentResolveRequest {
  sourceEntityType: string;
  sourceEntityId: string;
  attachmentType: string;
}

export interface AttachmentProviderMetadata {
  outputEntityType: "image" | "document";
  targetField?: "coverImageId" | "ogImageId";
}

const attachmentMetadataSchema = z.object({
  outputEntityType: z.enum(["image", "document"]),
  targetField: z.enum(["coverImageId", "ogImageId"]).optional(),
});

function copyAttachmentMetadata(
  source: AttachmentProviderMetadata,
): AttachmentProviderMetadata {
  const parsed = attachmentMetadataSchema.parse(source);
  return {
    outputEntityType: parsed.outputEntityType,
    ...(parsed.targetField !== undefined
      ? { targetField: parsed.targetField }
      : {}),
  };
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

/** Runtime-owned registration for declared attachment providers. */
export interface AttachmentRegistrationNamespace extends IAttachmentsNamespace {
  register(
    sourceEntityType: string,
    attachmentType: string,
    provider: AttachmentProvider,
  ): () => void;
}

export function createAttachmentReader(
  attachments: IAttachmentsNamespace,
): IAttachmentsNamespace {
  return {
    resolve: (request) => attachments.resolve(request),
    hasProvider: (source, type) => attachments.hasProvider(source, type),
    getProviderMetadata: (source, type) =>
      attachments.getProviderMetadata(source, type),
  };
}

export function createAttachmentsNamespace(
  registry: AttachmentRegistry,
): AttachmentRegistrationNamespace {
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
  private readonly providers = new Map<
    string,
    Map<string, AttachmentProvider>
  >();

  public static createFresh(): AttachmentRegistry {
    return new AttachmentRegistry();
  }

  private constructor() {}

  public register(
    sourceEntityType: string,
    attachmentType: string,
    provider: AttachmentProvider,
  ): () => void {
    const metadata = provider.metadata;
    const registered: AttachmentProvider = Object.freeze({
      ...(metadata !== undefined
        ? { metadata: Object.freeze(copyAttachmentMetadata(metadata)) }
        : {}),
      resolve: provider.resolve.bind(provider),
    });
    const providersByAttachmentType =
      this.getOrCreateSourceProviders(sourceEntityType);
    providersByAttachmentType.set(attachmentType, registered);

    return () => {
      if (this.get(sourceEntityType, attachmentType) === registered) {
        this.unregister(sourceEntityType, attachmentType);
      }
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
    const metadata = this.get(sourceEntityType, attachmentType)?.metadata;
    return metadata === undefined
      ? undefined
      : copyAttachmentMetadata(metadata);
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
