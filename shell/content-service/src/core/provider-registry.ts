import type { 
  IContentProvider, 
  ProviderContentTypes 
} from "../interfaces/provider";
import type { Logger } from "@brains/utils";

/**
 * Registry for content providers
 * 
 * Manages registration and lookup of content providers.
 * Each provider is responsible for generating specific types of content.
 */
export class ProviderRegistry {
  private providers = new Map<string, IContentProvider>();
  private typeToProvider = new Map<string, string>(); // Maps content type to provider ID

  constructor(private readonly logger: Logger) {}

  /**
   * Register a content provider
   */
  register(provider: IContentProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Provider with ID "${provider.id}" is already registered`);
    }

    // Register the provider
    this.providers.set(provider.id, provider);
    
    // Map content types to this provider
    const contentTypes = provider.getContentTypes();
    for (const type of contentTypes) {
      const typeKey = `${provider.id}:${type.id}`;
      this.typeToProvider.set(typeKey, provider.id);
    }

    this.logger.info(`Registered content provider: ${provider.id}`, {
      name: provider.name,
      version: provider.version,
      contentTypes: contentTypes.map(t => t.id),
    });
  }

  /**
   * Unregister a content provider
   */
  unregister(providerId: string): void {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return;
    }

    // Remove type mappings
    const contentTypes = provider.getContentTypes();
    for (const type of contentTypes) {
      const typeKey = `${providerId}:${type.id}`;
      this.typeToProvider.delete(typeKey);
    }

    // Remove provider
    this.providers.delete(providerId);
    
    this.logger.info(`Unregistered content provider: ${providerId}`);
  }

  /**
   * Get a provider by ID
   */
  get(providerId: string): IContentProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Get provider that handles a specific content type
   */
  getProviderForType(providerId: string, contentType: string): IContentProvider | undefined {
    const typeKey = `${providerId}:${contentType}`;
    const providerIdForType = this.typeToProvider.get(typeKey);
    if (!providerIdForType) {
      return undefined;
    }
    return this.providers.get(providerIdForType);
  }

  /**
   * Check if a provider is registered
   */
  has(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  /**
   * List all registered providers
   */
  list(): IContentProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get all content types from all providers
   */
  getAllContentTypes(): ProviderContentTypes[] {
    return this.list().map(provider => ({
      provider: provider.id,
      types: provider.getContentTypes(),
    }));
  }

  /**
   * Clear all providers (mainly for testing)
   */
  clear(): void {
    this.providers.clear();
    this.typeToProvider.clear();
  }
}