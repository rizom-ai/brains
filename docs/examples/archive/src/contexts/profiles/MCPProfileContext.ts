import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { ProfileNoteAdapter } from '@/contexts/profiles/adapters/profileNoteAdapter';
import { ProfileFormatter } from '@/contexts/profiles/formatters/profileFormatter';
import type { LinkedInProfile } from '@/models/linkedInProfile';
import type { Note } from '@/models/note';
import type { Profile } from '@/models/profile';
import { LinkedInProfileMigrationAdapter } from '@/services/profiles/linkedInProfileMigrationAdapter';
import { Logger } from '@/utils/logger';
import { TagExtractor } from '@/utils/tagExtractor'; // Needed for ProfileNoteAdapter dependency

import type {
  ContextCapabilities,
  ContextStatus,
  MCPContext,
  MCPFormatterInterface,
  MCPStorageInterface,
  ResourceDefinition,
} from '../MCPContext';
import { createContextFunctionality } from '../MCPContext';
import { MCPNoteContext } from '../notes/MCPNoteContext';

import { type ProfileToolContext, ProfileToolService } from './tools';

/**
 * Configuration for MCPProfileContext
 */
export interface MCPProfileContextConfig {
  name?: string;
  version?: string;
}

/**
 * Dependencies for MCPProfileContext
 */
export interface MCPProfileContextDependencies {
  noteContext: MCPNoteContext;
  profileNoteAdapter: ProfileNoteAdapter;
  profileMigrationAdapter: LinkedInProfileMigrationAdapter;
  profileFormatter: ProfileFormatter;
  logger: Logger;
}

/**
 * MCPProfileContext - Simplified profile context implementation
 * 
 * This implementation follows the new MCPContext pattern, eliminating BaseContext
 * and implementing functionality directly.
 * 
 * Also implements ProfileToolContext for compatibility with ProfileToolService.
 */
export class MCPProfileContext implements MCPContext, ProfileToolContext {
  // Singleton pattern
  private static instance: MCPProfileContext | null = null;
  
  // Core components
  private readonly contextFuncs: ReturnType<typeof createContextFunctionality>;
  private readonly noteContext: MCPNoteContext;
  private readonly profileNoteAdapter: ProfileNoteAdapter;
  private readonly profileMigrationAdapter: LinkedInProfileMigrationAdapter;
  private readonly profileFormatter: ProfileFormatter;
  private readonly logger: Logger;
  
  // MCP resources and tools
  private resources: ResourceDefinition[] = [];
  private tools: ResourceDefinition[] = [];
  
  /**
   * Get the singleton instance
   */
  public static getInstance(
    config?: MCPProfileContextConfig,
    dependencies?: MCPProfileContextDependencies,
  ): MCPProfileContext {
    if (!MCPProfileContext.instance) {
      // Create default dependencies if not provided
      const defaultDependencies: MCPProfileContextDependencies = dependencies || {
        logger: Logger.getInstance(),
        noteContext: MCPNoteContext.getInstance(),
        profileNoteAdapter: ProfileNoteAdapter.getInstance({
          noteContext: MCPNoteContext.getInstance(),
          tagExtractor: TagExtractor.getInstance(),
        }),
        profileMigrationAdapter: LinkedInProfileMigrationAdapter.getInstance(),
        profileFormatter: ProfileFormatter.getInstance(),
      };
      MCPProfileContext.instance = new MCPProfileContext(config || {}, defaultDependencies);
    }
    return MCPProfileContext.instance;
  }
  
  /**
   * Reset the singleton instance (for testing)
   */
  public static resetInstance(): void {
    MCPProfileContext.instance = null;
  }
  
  /**
   * Create a fresh instance (for testing)
   */
  public static createFresh(
    config: MCPProfileContextConfig,
    dependencies: MCPProfileContextDependencies,
  ): MCPProfileContext {
    return new MCPProfileContext(config, dependencies);
  }
  
  private constructor(
    config: MCPProfileContextConfig,
    dependencies: MCPProfileContextDependencies,
  ) {
    // Initialize dependencies
    this.logger = dependencies.logger;
    this.noteContext = dependencies.noteContext;
    this.profileNoteAdapter = dependencies.profileNoteAdapter;
    this.profileMigrationAdapter = dependencies.profileMigrationAdapter;
    this.profileFormatter = dependencies.profileFormatter;
    
    // Create core context functionality
    this.contextFuncs = createContextFunctionality({
      name: config.name || 'ProfileBrain',
      version: config.version || '2.0.0',
      logger: this.logger,
    });
  }
  
  // MCPContext interface implementation
  
  async initialize(): Promise<boolean> {
    try {
      // Setup MCP resources and tools
      this.setupResources();
      this.setupTools();
      
      // Initialize base functionality
      const result = await this.contextFuncs.initialize();
      
      return result;
    } catch (error) {
      this.logger.error('Failed to initialize MCPProfileContext', { error });
      return false;
    }
  }
  
  getContextName(): string {
    return this.contextFuncs.getContextName();
  }
  
  getContextVersion(): string {
    return this.contextFuncs.getContextVersion();
  }
  
  isReady(): boolean {
    return this.contextFuncs.isReady();
  }
  
  getStatus(): ContextStatus {
    return {
      ...this.contextFuncs.getStatus(),
      resourceCount: this.resources.length,
      toolCount: this.tools.length,
    };
  }
  
  getStorage(): MCPStorageInterface {
    // Return a storage adapter that delegates to profile operations
    return {
      create: async (item: Record<string, unknown>) => {
        const success = await this.saveProfile(item as Profile);
        return success ? ProfileNoteAdapter.PROFILE_NOTE_ID : '';
      },
      
      read: async (id: string) => {
        if (id === ProfileNoteAdapter.PROFILE_NOTE_ID) {
          const profile = await this.getProfile();
          return profile as Record<string, unknown> | null;
        }
        return null;
      },
      
      update: async (id: string, updates: Record<string, unknown>) => {
        if (id === ProfileNoteAdapter.PROFILE_NOTE_ID) {
          return await this.updateProfile(updates as Partial<Profile>);
        }
        return false;
      },
      
      delete: async () => false, // Not implemented for profiles
      
      search: async () => {
        const profile = await this.getProfile();
        return profile ? [profile as Record<string, unknown>] : [];
      },
      
      list: async () => {
        const profile = await this.getProfile();
        return profile ? [profile as Record<string, unknown>] : [];
      },
      
      count: async () => {
        const profile = await this.getProfile();
        return profile ? 1 : 0;
      },
    };
  }
  
  getFormatter(): MCPFormatterInterface {
    return {
      format: (data: unknown, options?: Record<string, unknown>) => {
        return this.profileFormatter.format(data as Profile, options);
      },
    };
  }
  
  registerOnServer(server: McpServer): boolean {
    // Add our resources and tools to the context functionality
    this.contextFuncs.resources.length = 0;
    this.contextFuncs.resources.push(...this.resources);
    this.contextFuncs.tools.length = 0;
    this.contextFuncs.tools.push(...this.tools);
    
    // Register using the context functionality
    return this.contextFuncs.registerOnServer(server);
  }
  
  getMcpServer(): McpServer {
    return this.contextFuncs.getMcpServer();
  }
  
  getCapabilities(): ContextCapabilities {
    return {
      resources: [...this.resources],
      tools: [...this.tools],
      features: [],
    };
  }
  
  async cleanup(): Promise<void> {
    await this.contextFuncs.cleanup();
  }
  
  // Setup methods
  
  private setupResources(): void {
    this.resources = [
      {
        protocol: 'profile',
        path: '/profile',
        name: 'profile',
        description: 'Access user profile data',
        handler: async () => {
          const profile = await this.getProfile();
          return { profile };
        },
      },
    ];
  }
  
  private setupTools(): void {
    // Get the tool service instance
    const toolService = ProfileToolService.getInstance();
    
    // Register profile tools using the tool service
    const tools = toolService.getTools(this);
    
    // Store the tools in our context
    this.tools = tools;
  }
  
  // Profile-specific methods
  
  /**
   * Get the user profile
   */
  async getProfile(): Promise<Profile | null> {
    try {
      return await this.profileNoteAdapter.getProfile();
    } catch (error) {
      this.logger.error('Failed to retrieve profile', { error, context: 'MCPProfileContext' });
      return null;
    }
  }
  
  /**
   * Save the user profile
   */
  async saveProfile(profile: Profile): Promise<boolean> {
    try {
      return await this.profileNoteAdapter.saveProfile(profile);
    } catch (error) {
      this.logger.error('Failed to save profile', { error, context: 'MCPProfileContext' });
      return false;
    }
  }
  
  /**
   * Update the user profile (partial update)
   */
  async updateProfile(data: Partial<Profile>): Promise<boolean> {
    try {
      const currentProfile = await this.getProfile();
      if (!currentProfile) return false;
      
      return this.saveProfile({
        ...currentProfile,
        ...data,
      });
    } catch (error) {
      this.logger.error('Failed to update profile', { error, context: 'MCPProfileContext' });
      return false;
    }
  }
  
  /**
   * Migrate a LinkedIn profile to our new format
   */
  async migrateLinkedInProfile(linkedInProfile: LinkedInProfile): Promise<boolean> {
    try {
      this.logger.debug('Starting LinkedIn profile migration', { context: 'MCPProfileContext' });
      
      this.logger.debug('Converting LinkedIn profile to standard format', { context: 'MCPProfileContext' });
      const profile = this.profileMigrationAdapter.convertToProfile(linkedInProfile);
      
      this.logger.debug('Converted profile, attempting to save', { context: 'MCPProfileContext' });
      const result = await this.saveProfile(profile);
      
      this.logger.debug(`Profile saved result: ${result}`, { context: 'MCPProfileContext' });
      return result;
    } catch (error) {
      this.logger.error('Failed to migrate LinkedIn profile', { error, context: 'MCPProfileContext' });
      return false;
    }
  }
  
  /**
   * Get profile as a note (for interoperability)
   */
  async getProfileAsNote(): Promise<Note | null> {
    try {
      const note = await this.noteContext.getNoteById(ProfileNoteAdapter.PROFILE_NOTE_ID);
      return note || null;
    } catch (error) {
      this.logger.error('Failed to get profile as note', { error, context: 'MCPProfileContext' });
      return null;
    }
  }
  
  /**
   * For backward compatibility with old code
   */
  async getActiveProfile(): Promise<Profile | null> {
    return this.getProfile();
  }
}