import type { PublishMediaData } from "@brains/contracts";
import {
  consumeAttachmentFile,
  type AttachmentFileResolver,
  type AttachmentFileConsumer,
  type AttachmentFileOptions,
} from "./attachment-file";

export interface AttachmentResolveRequest {
  sourceEntityType: string;
  sourceEntityId: string;
  attachmentType: string;
}

export interface AttachmentProviderMetadata {
  outputEntityType: "image" | "document";
  targetField?: "coverImageId" | "ogImageId";
}

export interface FileAttachmentProvider {
  metadata?: AttachmentProviderMetadata;
  withFile: AttachmentFileResolver;
}
export type AttachmentProviderRegistration =
  AttachmentProvider | FileAttachmentProvider;

export interface AttachmentProvider {
  metadata?: AttachmentProviderMetadata;
  withFile?: AttachmentFileResolver;
  resolve(
    request: AttachmentResolveRequest,
  ): Promise<PublishMediaData | undefined> | PublishMediaData | undefined;
}

/**
 * Attachment namespace — source-derived publish artifacts.
 * Source plugins register providers; publishers resolve by semantic attachment type.
 */
export interface IAttachmentsNamespace {
  /** Borrow a validated file through consumer and producer cleanup; never call buffered resolve. */
  withFile: AttachmentFileResolver;
  /** Register an attachment provider for a source entity type and semantic attachment type. */
  register: (
    sourceEntityType: string,
    attachmentType: string,
    provider: AttachmentProviderRegistration,
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
    withFile: <T>(
      request: AttachmentResolveRequest,
      use: AttachmentFileConsumer<T>,
      options?: AttachmentFileOptions,
    ): Promise<T | undefined> => registry.withFile(request, use, options),
    register: (
      sourceEntityType: string,
      attachmentType: string,
      provider: AttachmentProviderRegistration,
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
    Map<string, AttachmentProviderRegistration>
  >();

  public static createFresh(): AttachmentRegistry {
    return new AttachmentRegistry();
  }

  private constructor() {}

  public register(
    sourceEntityType: string,
    attachmentType: string,
    provider: AttachmentProviderRegistration,
  ): () => void {
    const providersByAttachmentType =
      this.getOrCreateSourceProviders(sourceEntityType);
    providersByAttachmentType.set(attachmentType, provider);

    return () => {
      this.unregister(sourceEntityType, attachmentType);
    };
  }

  public async withFile<T>(
    request: AttachmentResolveRequest,
    use: AttachmentFileConsumer<T>,
    options?: AttachmentFileOptions,
  ): Promise<T | undefined> {
    options?.signal?.throwIfAborted();
    const provider = this.get(request.sourceEntityType, request.attachmentType);
    if (!provider) return undefined;
    if (!provider.withFile)
      throw new Error("Attachment provider does not support file handoff");
    return consumeAttachmentFile(
      provider.withFile.bind(provider),
      request,
      use,
      options,
    );
  }

  public async resolve(
    request: AttachmentResolveRequest,
  ): Promise<PublishMediaData | undefined> {
    const provider = this.get(request.sourceEntityType, request.attachmentType);
    if (!provider) return undefined;
    if (!("resolve" in provider)) {
      throw new Error(
        "Attachment provider does not support buffered resolution",
      );
    }
    return provider.resolve(request);
  }

  public get(
    sourceEntityType: string,
    attachmentType: string,
  ): AttachmentProviderRegistration | undefined {
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
  ): Map<string, AttachmentProviderRegistration> {
    const existing = this.providers.get(sourceEntityType);
    if (existing) {
      return existing;
    }

    const providersByAttachmentType = new Map<
      string,
      AttachmentProviderRegistration
    >();
    this.providers.set(sourceEntityType, providersByAttachmentType);
    return providersByAttachmentType;
  }
}
