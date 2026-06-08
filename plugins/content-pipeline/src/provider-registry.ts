/**
 * ProviderRegistry - Manages publish providers per entity type
 *
 * Implements Component Interface Standardization pattern.
 * Provides default internal provider for types without explicit registration.
 */

import type { PublishProvider } from "@brains/contracts";
import { InternalPublishProvider } from "./types/provider";
import type { PublishConfig, PublishExecutionMode } from "./types/config";

export class ProviderRegistry {
  private static instance: ProviderRegistry | null = null;

  // Map of entityType -> provider
  private providers: Map<string, PublishProvider> = new Map();
  private executionModes: Map<string, PublishExecutionMode> = new Map();
  private publishResultIdFields: Map<string, string> = new Map();
  private publishTimestampFields: Map<string, string> = new Map();

  // Default provider for internal publishing (blog, decks, etc.)
  private defaultProvider: PublishProvider = new InternalPublishProvider();

  /**
   * Get the singleton instance
   */
  public static getInstance(): ProviderRegistry {
    ProviderRegistry.instance ??= new ProviderRegistry();
    return ProviderRegistry.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    ProviderRegistry.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(): ProviderRegistry {
    return new ProviderRegistry();
  }

  /**
   * Private constructor to enforce factory methods
   */
  private constructor() {}

  /**
   * Register a provider for an entity type.
   *
   * Internal providers are local fallback handlers. They must not override an
   * explicit external provider that is already registered for the same entity
   * type, but any explicit provider may replace an internal fallback.
   */
  public register(
    entityType: string,
    provider: PublishProvider,
    config?: Pick<
      PublishConfig,
      "executionMode" | "publishResultIdField" | "publishTimestampField"
    >,
  ): void {
    const existingProvider = this.providers.get(entityType);
    if (
      existingProvider &&
      existingProvider.name !== "internal" &&
      provider.name === "internal"
    ) {
      return;
    }

    this.providers.set(entityType, provider);
    this.executionModes.set(entityType, config?.executionMode ?? "provider");

    if (config?.publishResultIdField) {
      this.publishResultIdFields.set(entityType, config.publishResultIdField);
    } else {
      this.publishResultIdFields.delete(entityType);
    }

    if (config?.publishTimestampField) {
      this.publishTimestampFields.set(entityType, config.publishTimestampField);
    } else {
      this.publishTimestampFields.delete(entityType);
    }
  }

  /**
   * Get the provider for an entity type
   * Returns default internal provider if not registered
   */
  public get(entityType: string): PublishProvider {
    return this.providers.get(entityType) ?? this.defaultProvider;
  }

  /**
   * Get how an entity type should be published.
   */
  public getExecutionMode(entityType: string): PublishExecutionMode {
    return this.executionModes.get(entityType) ?? "provider";
  }

  /**
   * Get the optional field for provider result IDs.
   */
  public getPublishResultIdField(entityType: string): string | undefined {
    return this.publishResultIdFields.get(entityType);
  }

  /**
   * Get the optional field for publish timestamps.
   */
  public getPublishTimestampField(entityType: string): string | undefined {
    return this.publishTimestampFields.get(entityType);
  }

  /**
   * Check if a provider is registered for an entity type
   */
  public has(entityType: string): boolean {
    return this.providers.has(entityType);
  }

  /**
   * Unregister a provider for an entity type
   */
  public unregister(entityType: string): void {
    this.providers.delete(entityType);
    this.executionModes.delete(entityType);
    this.publishResultIdFields.delete(entityType);
    this.publishTimestampFields.delete(entityType);
  }

  /**
   * Get all registered entity types
   */
  public getRegisteredTypes(): string[] {
    return Array.from(this.providers.keys());
  }
}
