/**
 * ProviderRegistry - Manages publish providers per entity type
 *
 * Implements Component Interface Standardization pattern.
 * Provides default internal provider for types without explicit registration.
 */

import type { PublishProvider } from "@brains/utils";
import { InternalPublishProvider } from "./types/provider";

export class ProviderRegistry {
  private static instance: ProviderRegistry | null = null;

  // Map of entityType -> provider
  private providers: Map<string, PublishProvider> = new Map();

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
   * Register a provider for an entity type
   */
  public register(entityType: string, provider: PublishProvider): void {
    this.providers.set(entityType, provider);
  }

  /**
   * Get the provider for an entity type
   * Returns default internal provider if not registered
   */
  public get(entityType: string): PublishProvider {
    return this.providers.get(entityType) ?? this.defaultProvider;
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
  }

  /**
   * Get all registered entity types
   */
  public getRegisteredTypes(): string[] {
    return Array.from(this.providers.keys());
  }
}
