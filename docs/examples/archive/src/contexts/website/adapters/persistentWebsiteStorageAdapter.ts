/**
 * PersistentWebsiteStorageAdapter
 * 
 * Persistent implementation of the WebsiteStorageAdapter interface
 * Uses the LandingPageNoteAdapter to store landing page data as a note
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */
import type { ListOptions, SearchCriteria } from '@/contexts/storageInterface';
import { Logger } from '@/utils/logger';

import type { LandingPageData, WebsiteConfig } from '../websiteStorage';
import { WebsiteConfigSchema } from '../websiteStorage';

import { LandingPageNoteAdapter } from './landingPageNoteAdapter';
import type { WebsiteDataItem, WebsiteStorageAdapter } from './websiteStorageAdapter';

/**
 * Configuration options for PersistentWebsiteStorageAdapter
 */
export interface PersistentWebsiteStorageAdapterConfig {
  /** Initial config to use */
  initialConfig?: WebsiteConfig;
}

/**
 * Dependencies for PersistentWebsiteStorageAdapter
 */
export interface PersistentWebsiteStorageAdapterDependencies {
  /** Landing page adapter for persistence */
  landingPageAdapter: LandingPageNoteAdapter;
  /** Logger instance */
  logger?: Logger;
}

/**
 * Persistent implementation of WebsiteStorageAdapter using notes for storage
 */
export class PersistentWebsiteStorageAdapter implements WebsiteStorageAdapter {
  /** The singleton instance */
  private static instance: PersistentWebsiteStorageAdapter | null = null;
  
  /** Logger instance */
  private readonly logger: Logger;
  
  /** Landing page adapter for note-based persistence */
  private readonly landingPageAdapter: LandingPageNoteAdapter;
  
  /** In-memory config cache */
  private config: WebsiteConfig;
  
  /** Items cache for the generic StorageInterface */
  private items: Map<string, WebsiteDataItem> = new Map();
  
  /** Initialization flag */
  private initialized = false;
  
  /**
   * Create a new PersistentWebsiteStorageAdapter
   * @param landingPageAdapter The landing page adapter to use
   * @param config Configuration options
   */
  constructor(
    landingPageAdapter: LandingPageNoteAdapter,
    config: PersistentWebsiteStorageAdapterConfig = {},
  ) {
    this.logger = Logger.getInstance();
    this.landingPageAdapter = landingPageAdapter;
    
    // Use provided config or default
    this.config = config.initialConfig || WebsiteConfigSchema.parse({
      title: 'Personal Brain',
      description: 'My personal website',
      author: 'Anonymous',
      baseUrl: 'http://localhost:4321',
      astroProjectPath: 'src/website',
      deployment: {
        type: 'local-dev',
        previewPort: 4321,
        livePort: 4322,
      },
    });
  }
  
  /**
   * Get the singleton instance of PersistentWebsiteStorageAdapter
   * @param config Configuration options
   * @returns The shared instance
   */
  public static getInstance(config: PersistentWebsiteStorageAdapterConfig = {}): PersistentWebsiteStorageAdapter {
    if (!PersistentWebsiteStorageAdapter.instance) {
      const landingPageAdapter = LandingPageNoteAdapter.getInstance();
      PersistentWebsiteStorageAdapter.instance = new PersistentWebsiteStorageAdapter(landingPageAdapter, config);
      
      // Auto-initialize
      void PersistentWebsiteStorageAdapter.instance.initialize();
    }
    return PersistentWebsiteStorageAdapter.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    PersistentWebsiteStorageAdapter.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * @param config Configuration options
   * @param dependencies Injectable dependencies
   * @returns A new PersistentWebsiteStorageAdapter instance
   */
  public static createFresh(
    config: PersistentWebsiteStorageAdapterConfig = {},
    dependencies: PersistentWebsiteStorageAdapterDependencies,
  ): PersistentWebsiteStorageAdapter {
    if (!dependencies || !dependencies.landingPageAdapter) {
      throw new Error('LandingPageNoteAdapter is required for PersistentWebsiteStorageAdapter.createFresh()');
    }
    
    return new PersistentWebsiteStorageAdapter(
      dependencies.landingPageAdapter,
      config,
    );
  }
  
  /**
   * Initialize the storage adapter
   * Loads data from persistent storage
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    try {
      this.logger.debug('Initializing PersistentWebsiteStorageAdapter');
      
      // Set up default items in the cache
      this.items.set('config', {
        id: 'config',
        type: 'config',
        data: this.config,
      });
      
      // Try to load landing page data from notes
      const landingPageData = await this.landingPageAdapter.getLandingPageData();
      if (landingPageData) {
        this.logger.debug('Loaded landing page data from notes');
        this.items.set('landingPage', {
          id: 'landingPage',
          type: 'landingPage',
          data: landingPageData,
        });
      } else {
        this.logger.debug('No landing page data found in notes');
      }
      
      this.initialized = true;
      this.logger.debug('PersistentWebsiteStorageAdapter initialized successfully');
    } catch (error) {
      this.logger.error('Error initializing PersistentWebsiteStorageAdapter', error);
      // Initialize with empty state
      this.initialized = true;
    }
  }
  
  /**
   * Check if the adapter is initialized
   * @returns True if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
  
  // Config methods removed - we now use the config.ts directly
  
  /**
   * Get the landing page data
   * @returns The landing page data or null if not found
   */
  async getLandingPageData(): Promise<LandingPageData | null> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    return this.landingPageAdapter.getLandingPageData();
  }
  
  /**
   * Save the landing page data
   * @param data The landing page data to save
   */
  async saveLandingPageData(data: LandingPageData): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const success = await this.landingPageAdapter.saveLandingPageData(data);
    
    if (success) {
      // Update the cached item too
      this.items.set('landingPage', {
        id: 'landingPage',
        type: 'landingPage',
        data,
      });
      this.logger.debug('Landing page data saved successfully');
    } else {
      this.logger.error('Failed to save landing page data');
    }
  }
  
  // StorageInterface implementation
  
  async create(item: Partial<WebsiteDataItem>): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!item.id) {
      throw new Error('Item ID is required');
    }
    
    if (item.type === 'landingPage' && item.data) {
      // Use the landing page adapter for landingPage items
      await this.saveLandingPageData(item.data as LandingPageData);
    }
    
    // Add to in-memory cache
    this.items.set(item.id, item as WebsiteDataItem);
    return item.id;
  }
  
  async read(id: string): Promise<WebsiteDataItem | null> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // Check in-memory cache first
    if (this.items.has(id)) {
      return this.items.get(id) || null;
    }
    
    // If it's the landing page item, try to get from notes
    if (id === 'landingPage') {
      const landingPageData = await this.landingPageAdapter.getLandingPageData();
      if (landingPageData) {
        const item: WebsiteDataItem = {
          id: 'landingPage',
          type: 'landingPage',
          data: landingPageData,
        };
        this.items.set(id, item);
        return item;
      }
    }
    
    return null;
  }
  
  async update(id: string, updates: Partial<WebsiteDataItem>): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const existingItem = await this.read(id);
    if (!existingItem) {
      return false;
    }
    
    const updatedItem: WebsiteDataItem = { ...existingItem, ...updates };
    
    // If it's the landing page item, save to notes
    if (id === 'landingPage' && updates.data) {
      await this.saveLandingPageData(updates.data as LandingPageData);
    }
    
    // Update in-memory cache
    this.items.set(id, updatedItem);
    return true;
  }
  
  async delete(id: string): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // For now, we only allow deleting from in-memory cache
    // Landing page data in notes is preserved
    return this.items.delete(id);
  }
  
  async search(criteria: SearchCriteria): Promise<WebsiteDataItem[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // Ensure we have the latest landing page data
    await this.read('landingPage');
    
    return Array.from(this.items.values()).filter(item => {
      // Simple matching logic - match any property in criteria
      return Object.entries(criteria).every(([key, value]) => {
        if (key === 'type' && item.type) {
          return item.type === value;
        }
        // Handle nested data searches
        if (key.startsWith('data.') && item.data) {
          const dataKey = key.substring(5);
          const dataRecord = item.data as Record<string, unknown>;
          return dataRecord[dataKey] === value;
        }
        // Use type assertion through unknown to avoid direct conversion
        const itemAsRecord = item as unknown as Record<string, unknown>;
        return itemAsRecord[key] === value;
      });
    });
  }
  
  async list(options?: ListOptions): Promise<WebsiteDataItem[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // Ensure we have the latest landing page data
    await this.read('landingPage');
    
    const items = Array.from(this.items.values());
    
    if (!options) {
      return items;
    }
    
    const { limit, offset } = options;
    const start = offset || 0;
    const end = limit ? start + limit : undefined;
    
    return items.slice(start, end);
  }
  
  async count(criteria?: SearchCriteria): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!criteria) {
      return this.items.size;
    }
    
    const items = await this.search(criteria);
    return items.length;
  }
}