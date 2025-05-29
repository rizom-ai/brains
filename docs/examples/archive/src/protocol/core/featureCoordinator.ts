/**
 * Feature Coordinator
 * 
 * Manages and coordinates system-wide features across multiple components.
 * This component ensures that feature flags and settings are consistently 
 * applied across all relevant components.
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import { Logger } from '@/utils/logger';


import type { ConfigurationManager } from './configurationManager';
import type { ContextOrchestrator } from './contextOrchestrator';
import type { StatusManager } from './statusManager';

/**
 * Configuration options for FeatureCoordinator
 */
export interface FeatureCoordinatorOptions {
  /** Configuration manager for accessing and updating configuration */
  configManager: ConfigurationManager;
  /** Context orchestrator for context coordination */
  contextOrchestrator: ContextOrchestrator;
  /** Status manager for updating status information */
  statusManager: StatusManager;
}

/**
 * Feature flag definition
 */
export interface FeatureFlag {
  /** Unique identifier for the feature */
  id: string;
  /** Whether the feature is enabled by default */
  enabledByDefault: boolean;
  /** Current state of the feature */
  enabled: boolean;
  /** Description of the feature */
  description: string;
  /** Metadata for the feature */
  metadata?: Record<string, unknown>;
}

/**
 * Coordinates system-wide features across components
 */
export class FeatureCoordinator {
  private static instance: FeatureCoordinator | null = null;
  
  /** Configuration manager instance */
  private configManager: ConfigurationManager;
  /** Context orchestrator instance */
  private contextOrchestrator: ContextOrchestrator;
  /** Status manager instance */
  private statusManager: StatusManager;
  
  /** Feature flag registry */
  private featureFlags: Map<string, FeatureFlag> = new Map();
  
  /** Logger instance */
  private logger = Logger.getInstance();
  
  /**
   * Get the singleton instance of FeatureCoordinator
   * 
   * @param options Configuration options
   * @returns The singleton instance
   */
  public static getInstance(options: FeatureCoordinatorOptions): FeatureCoordinator {
    if (!FeatureCoordinator.instance) {
      FeatureCoordinator.instance = new FeatureCoordinator(options);
      
      const logger = Logger.getInstance();
      logger.debug('FeatureCoordinator singleton instance created');
    }
    
    return FeatureCoordinator.instance;
  }
  
  /**
   * Reset the singleton instance
   * This is primarily used for testing to ensure a clean state between tests
   */
  public static resetInstance(): void {
    FeatureCoordinator.instance = null;
    
    const logger = Logger.getInstance();
    logger.debug('FeatureCoordinator singleton instance reset');
  }
  
  /**
   * Create a fresh instance without affecting the singleton
   * 
   * @param options Configuration options
   * @returns A new instance
   */
  public static createFresh(options: FeatureCoordinatorOptions): FeatureCoordinator {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh FeatureCoordinator instance');
    
    return new FeatureCoordinator(options);
  }
  
  /**
   * Private constructor to enforce getInstance() usage
   * 
   * @param options Configuration options
   */
  private constructor(options: FeatureCoordinatorOptions) {
    this.configManager = options.configManager;
    this.contextOrchestrator = options.contextOrchestrator;
    this.statusManager = options.statusManager;
    
    // Initialize feature flags
    this.initializeFeatureFlags();
    
    this.logger.debug('FeatureCoordinator initialized');
  }
  
  /**
   * Initialize feature flags with default values
   */
  private initializeFeatureFlags(): void {
    // Register external sources as a feature flag
    this.registerFeature({
      id: 'external-sources',
      enabledByDefault: false,
      enabled: this.configManager.getUseExternalSources(),
      description: 'Enable external knowledge sources for queries',
    });
    
    // Future feature flags can be registered here
    
    this.logger.debug(`Initialized ${this.featureFlags.size} feature flags`);
  }
  
  /**
   * Register a new feature flag
   * @param feature Feature flag definition
   */
  registerFeature(feature: FeatureFlag): void {
    if (this.featureFlags.has(feature.id)) {
      this.logger.warn(`Feature flag '${feature.id}' already registered, updating definition`);
    }
    
    this.featureFlags.set(feature.id, feature);
    this.logger.debug(`Registered feature flag: ${feature.id}`);
  }
  
  /**
   * Get all registered feature flags
   * @returns Array of feature flag definitions
   */
  getAllFeatures(): FeatureFlag[] {
    return Array.from(this.featureFlags.values());
  }
  
  /**
   * Get a specific feature flag by ID
   * @param featureId Feature flag ID
   * @returns Feature flag definition or undefined if not found
   */
  getFeature(featureId: string): FeatureFlag | undefined {
    return this.featureFlags.get(featureId);
  }
  
  /**
   * Check if a feature is enabled
   * @param featureId Feature flag ID
   * @returns Whether the feature is enabled
   */
  isFeatureEnabled(featureId: string): boolean {
    const feature = this.featureFlags.get(featureId);
    
    if (!feature) {
      this.logger.warn(`Feature flag '${featureId}' not found, returning false`);
      return false;
    }
    
    return feature.enabled;
  }
  
  /**
   * Enable or disable a feature flag
   * @param featureId Feature flag ID
   * @param enabled Whether the feature should be enabled
   * @returns Whether the operation was successful
   */
  setFeatureEnabled(featureId: string, enabled: boolean): boolean {
    const feature = this.featureFlags.get(featureId);
    
    if (!feature) {
      this.logger.warn(`Feature flag '${featureId}' not found, cannot set state`);
      return false;
    }
    
    // Update the feature flag
    feature.enabled = enabled;
    this.featureFlags.set(featureId, feature);
    
    // Handle special features that need coordination
    if (featureId === 'external-sources') {
      this.updateExternalSourcesState(enabled);
    }
    
    this.logger.info(`Feature flag '${featureId}' ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  }
  
  /**
   * Enable or disable external sources across all components
   * @param enabled Whether external sources should be enabled
   */
  private updateExternalSourcesState(enabled: boolean): void {
    // Update configuration
    this.configManager.setUseExternalSources(enabled);
    
    // Update contexts
    this.contextOrchestrator.setExternalSourcesEnabled(enabled);
    
    // Update status manager
    this.statusManager.setExternalSourcesEnabled(enabled);
    
    this.logger.info(`External sources ${enabled ? 'enabled' : 'disabled'} across all components`);
  }
  
  /**
   * Enable or disable external sources across all components
   * This is a convenience method that uses the feature flag system
   * @param enabled Whether external sources should be enabled
   */
  setExternalSourcesEnabled(enabled: boolean): void {
    this.setFeatureEnabled('external-sources', enabled);
  }
  
  /**
   * Get whether external sources are enabled
   * @returns Whether external sources are enabled
   */
  areExternalSourcesEnabled(): boolean {
    return this.isFeatureEnabled('external-sources');
  }
  
  /**
   * Reset all feature flags to their default values
   */
  resetFeaturesToDefaults(): void {
    for (const feature of this.featureFlags.values()) {
      this.setFeatureEnabled(feature.id, feature.enabledByDefault);
    }
    
    this.logger.info('All feature flags reset to default values');
  }
}