import type { ListOptions, SearchCriteria, StorageInterface } from '@/contexts/storageInterface';

import type { LandingPageData, WebsiteConfig } from '../websiteStorage';


/**
 * Website data type for StorageInterface compatibility
 */
export interface WebsiteDataItem {
  id: string;
  type: 'config' | 'landingPage';
  data: WebsiteConfig | LandingPageData;
}

/**
 * Storage adapter interface for the Website Context
 */
export interface WebsiteStorageAdapter extends StorageInterface<WebsiteDataItem> {
  /**
   * Initialize storage adapter
   */
  initialize(): Promise<void>;
  // No longer needed - using the config.ts directly
  
  // Landing page data
  getLandingPageData(): Promise<LandingPageData | null>;
  saveLandingPageData(data: LandingPageData): Promise<void>;
}

/**
 * In-memory implementation of WebsiteStorageAdapter for development
 */
export class InMemoryWebsiteStorageAdapter implements WebsiteStorageAdapter {
  private config: WebsiteConfig = {
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
  };
  
  private landingPageData: LandingPageData | null = null;
  private items: Map<string, WebsiteDataItem> = new Map();
  
  async initialize(): Promise<void> {
    // Nothing to initialize for in-memory storage
    // Set up default items
    this.items.set('config', {
      id: 'config',
      type: 'config',
      data: this.config,
    });
  }
  
  // Config methods removed - we now use config.ts directly
  
  async getLandingPageData(): Promise<LandingPageData | null> {
    return this.landingPageData;
  }
  
  async saveLandingPageData(data: LandingPageData): Promise<void> {
    this.landingPageData = data;
    // Update in items store too
    this.items.set('landingPage', {
      id: 'landingPage',
      type: 'landingPage',
      data,
    });
  }
  
  // StorageInterface implementation
  
  async create(item: Partial<WebsiteDataItem>): Promise<string> {
    if (!item.id) {
      throw new Error('Item ID is required');
    }
    this.items.set(item.id, item as WebsiteDataItem);
    return item.id;
  }
  
  async read(id: string): Promise<WebsiteDataItem | null> {
    return this.items.get(id) || null;
  }
  
  async update(id: string, updates: Partial<WebsiteDataItem>): Promise<boolean> {
    const existingItem = this.items.get(id);
    if (!existingItem) {
      return false;
    }
    
    this.items.set(id, { ...existingItem, ...updates });
    return true;
  }
  
  async delete(id: string): Promise<boolean> {
    return this.items.delete(id);
  }
  
  async search(criteria: SearchCriteria): Promise<WebsiteDataItem[]> {
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
    if (!criteria) {
      return this.items.size;
    }
    
    const items = await this.search(criteria);
    return items.length;
  }
}