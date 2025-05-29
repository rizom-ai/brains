/**
 * MCPWebsiteContext - Website Context using the simplified MCP design
 * 
 * This implementation uses the new composition-based MCPContext pattern
 * instead of the previous inheritance-based BaseContext approach.
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance 
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { websiteConfig } from '@/config';
import type { ContextStatus, MCPContext, MCPFormatterInterface, MCPStorageInterface } from '@/contexts/MCPContext';
import { createContextFunctionality } from '@/contexts/MCPContext';
import type { SearchCriteria } from '@/contexts/storageInterface';
import { ContextMediator } from '@/protocol/messaging/contextMediator';
import { Logger } from '@/utils/logger';
import type { LandingPageData } from '@website/schemas';
import type { AssessedSection } from '@website/schemas/sectionQualitySchema';

import { PersistentWebsiteStorageAdapter } from './adapters/persistentWebsiteStorageAdapter';
import { WebsiteIdentityNoteAdapter } from './adapters/websiteIdentityNoteAdapter';
import type { WebsiteStorageAdapter } from './adapters/websiteStorageAdapter';
import { type WebsiteData, WebsiteFormatter } from './formatters';
import { type WebsiteIdentityData } from './schemas/websiteIdentitySchema';
import { AstroContentService } from './services/astroContentService';
import { DeploymentManagerFactory } from './services/deployment';
import type { WebsiteDeploymentManager } from './services/deployment';
import { LandingPageGenerationService } from './services/landingPageGenerationService';
import { WebsiteIdentityService } from './services/websiteIdentityService';
import { WebsiteToolService } from './tools';
import type { LandingPageGenerationStatus } from './types/landingPageTypes';
import type { WebsiteConfig } from './websiteStorage';

/**
 * Configuration for the MCPWebsiteContext
 */
export interface MCPWebsiteContextConfig extends Record<string, unknown> {
  /**
   * Name for the context (defaults to 'WebsiteBrain')
   */
  name?: string;

  /**
   * Version for the context (defaults to '1.0.0')
   */
  version?: string;
}

/**
 * Dependencies for MCPWebsiteContext
 */
export interface MCPWebsiteContextDependencies {
  /** Storage adapter instance */
  storage?: WebsiteStorageAdapter;
  /** Formatter instance */
  formatter?: WebsiteFormatter;
  /** Astro content service instance */
  astroContentService?: AstroContentService;
  /** Landing page generation service instance */
  landingPageGenerationService?: LandingPageGenerationService;
  /** Context mediator instance */
  mediator?: ContextMediator;
  /** Deployment manager instance */
  deploymentManager?: WebsiteDeploymentManager;
  /** Website identity service instance */
  identityService?: WebsiteIdentityService;
  /** Logger instance */
  logger?: Logger;
}

/**
 * Website Context for managing website generation and deployment
 */
export class MCPWebsiteContext implements MCPContext {
  private static instance: MCPWebsiteContext | null = null;
  
  private logger: Logger;
  private storage: WebsiteStorageAdapter;
  private formatter: WebsiteFormatter;
  private astroContentService: AstroContentService;
  private landingPageGenerationService: LandingPageGenerationService;
  private mediator: ContextMediator;
  private deploymentManager: WebsiteDeploymentManager;
  private identityService: WebsiteIdentityService;
  
  // Context functionality from the utility
  private contextImpl: ReturnType<typeof createContextFunctionality>;
  
  /**
   * Private constructor - use getInstance or createFresh
   */
  private constructor(
    config: MCPWebsiteContextConfig,
    dependencies?: MCPWebsiteContextDependencies,
  ) {
    // Initialize dependencies
    this.logger = dependencies?.logger || Logger.getInstance();
    
    // Initialize storage and formatter
    this.storage = dependencies?.storage || PersistentWebsiteStorageAdapter.getInstance();
    this.formatter = dependencies?.formatter || WebsiteFormatter.getInstance();
    
    // Initialize services
    this.astroContentService = dependencies?.astroContentService || AstroContentService.getInstance({
      astroProjectPath: websiteConfig.astroProjectPath,
    });
    this.landingPageGenerationService = dependencies?.landingPageGenerationService || 
      LandingPageGenerationService.getInstance();
    
    // Initialize mediator and deployment manager
    this.mediator = dependencies?.mediator || ContextMediator.getInstance();
    this.deploymentManager = dependencies?.deploymentManager || 
      DeploymentManagerFactory.getInstance().create({
        deploymentType: websiteConfig.deployment.type,
      });
    
    // Initialize identity service
    const identityAdapter = WebsiteIdentityNoteAdapter.getInstance();
    this.identityService = dependencies?.identityService || 
      WebsiteIdentityService.getInstance({}, {
        mediator: this.mediator,
        identityAdapter,
      });
    
    // Create the context implementation using the utility function
    this.contextImpl = createContextFunctionality({
      name: config.name || 'WebsiteBrain',
      version: config.version || '1.0.0',
      logger: this.logger,
    });

    // Initialize MCP resources and tools
    this.initializeMcpComponents();
    
    this.logger.debug('MCPWebsiteContext initialized', {
      name: config.name || 'WebsiteBrain',
      context: 'MCPWebsiteContext',
    });
  }
  
  /**
   * Initialize MCP components (resources and tools)
   */
  private initializeMcpComponents(): void {
    // Register resources
    this.contextImpl.resources.push(
      {
        protocol: 'website',
        path: 'config',
        handler: async () => {
          const config = await this.getConfig();
          return config;
        },
        name: 'Website Configuration',
        description: 'Get website configuration settings',
      },
      
      {
        protocol: 'website',
        path: 'landing-page',
        handler: async () => {
          const data = await this.getLandingPageData();
          return data || { message: 'No landing page data available' };
        },
        name: 'Landing Page Data',
        description: 'Get current landing page data',
      },
      
      {
        protocol: 'website',
        path: 'identity',
        handler: async () => {
          const identity = await this.getIdentity();
          return identity || { message: 'No website identity available' };
        },
        name: 'Website Identity',
        description: 'Get website brand identity',
      },
    );
    
    // Register tools using the tool service pattern
    const toolService = WebsiteToolService.getInstance();
    const tools = toolService.getTools(this);
    
    // Convert tools to the expected format
    tools.forEach(tool => {
      this.contextImpl.tools.push({
        ...tool,
        name: tool.name || 'unknown',
        description: tool.description || '',
      });
    });
    
    this.logger.debug('Initialized MCP components', {
      resourceCount: this.contextImpl.resources.length,
      toolCount: this.contextImpl.tools.length,
      context: 'MCPWebsiteContext',
    });
  }
  
  // MCPContext interface implementation - delegate to contextImpl
  
  async initialize(): Promise<boolean> {
    // Initialize storage first
    await this.storage.initialize();
    
    // Initialize the context implementation
    const result = await this.contextImpl.initialize();
    
    this.logger.info('Initialized MCPWebsiteContext', {
      context: 'MCPWebsiteContext',
      ready: result,
    });
    
    return result;
  }
  
  getContextName(): string {
    return this.contextImpl.getContextName();
  }
  
  getContextVersion(): string {
    return this.contextImpl.getContextVersion();
  }
  
  isReady(): boolean {
    return this.contextImpl.isReady();
  }
  
  getStatus(): ContextStatus {
    return this.contextImpl.getStatus();
  }
  
  cleanup(): Promise<void> {
    return this.contextImpl.cleanup();
  }
  
  getStorage(): MCPStorageInterface {
    return {
      create: async (item: Record<string, unknown>) => {
        // Website storage is specialized - delegate to specific methods
        if (item['type'] === 'landingPage' && item['data']) {
          await this.saveLandingPageData(item['data'] as LandingPageData);
          return 'landing-page';
        }
        throw new Error('Unsupported item type for website storage');
      },
      
      read: async (id: string) => {
        if (id === 'landing-page') {
          const data = await this.getLandingPageData();
          return data ? { type: 'landingPage', data } : null;
        }
        if (id === 'config') {
          const config = await this.getConfig();
          return { type: 'config', data: config };
        }
        return null;
      },
      
      update: async (id: string, updates: Record<string, unknown>) => {
        if (id === 'landing-page' && updates['data']) {
          await this.saveLandingPageData(updates['data'] as LandingPageData);
          return true;
        }
        return false;
      },
      
      delete: async (_id: string) => {
        // Website storage doesn't support deletion
        return false;
      },
      
      search: async (criteria: SearchCriteria) => {
        const results = await this.storage.search(criteria);
        return results as unknown as Record<string, unknown>[];
      },
      
      list: async (options?: { limit?: number; offset?: number }) => {
        const results = await this.storage.list(options);
        return results as unknown as Record<string, unknown>[];
      },
      
      count: async () => {
        return this.storage.count();
      },
    };
  }
  
  getFormatter(): MCPFormatterInterface {
    return {
      format: (data: unknown, options?: Record<string, unknown>) => {
        return this.formatter.format(data as WebsiteData, options);
      },
    };
  }
  
  registerOnServer(server: McpServer): boolean {
    return this.contextImpl.registerOnServer(server);
  }
  
  getMcpServer(): McpServer {
    return this.contextImpl.getMcpServer();
  }
  
  getCapabilities(): {
    resources: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    tools: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    features: string[];
    } {
    return this.contextImpl.getCapabilities();
  }
  
  // Singleton pattern implementation
  
  /**
   * Get the singleton instance of MCPWebsiteContext
   * 
   * @param config Configuration options
   * @returns The singleton instance
   */
  static getInstance(config?: MCPWebsiteContextConfig): MCPWebsiteContext {
    if (!MCPWebsiteContext.instance) {
      MCPWebsiteContext.instance = MCPWebsiteContext.createFresh(config || {});
      
      const logger = Logger.getInstance();
      logger.debug('MCPWebsiteContext singleton instance created');
    } else if (config) {
      // Log at debug level if trying to get instance with different config
      const logger = Logger.getInstance();
      logger.debug('getInstance called with config but instance already exists. Config ignored.');
    }
    
    return MCPWebsiteContext.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance and any resources it holds
   */
  static resetInstance(): void {
    if (MCPWebsiteContext.instance) {
      // Stop any running servers before resetting the instance
      if (MCPWebsiteContext.instance.deploymentManager) {
        // Best-effort attempt to stop servers
        if ('stopServers' in MCPWebsiteContext.instance.deploymentManager) {
          try {
            const manager = MCPWebsiteContext.instance.deploymentManager as unknown as { stopServers(): Promise<void> };
            manager.stopServers().catch(error => {
              console.error('Error stopping servers during reset:', error);
            });
          } catch (error) {
            console.error('Error stopping servers during reset:', error);
          }
        }
      }
      
      // Any cleanup needed before destroying the instance
      const logger = Logger.getInstance();
      logger.debug('MCPWebsiteContext singleton instance reset');
      
      MCPWebsiteContext.instance = null;
    }
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * 
   * @param config Configuration options
   * @param dependencies Optional dependencies
   * @returns A new MCPWebsiteContext instance
   */
  static createFresh(
    config: MCPWebsiteContextConfig,
    dependencies?: MCPWebsiteContextDependencies,
  ): MCPWebsiteContext {
    const logger = dependencies?.logger || Logger.getInstance();
    logger.debug('Creating fresh MCPWebsiteContext instance');
    
    return new MCPWebsiteContext(config, dependencies);
  }
  
  // Core functionality methods
  
  /**
   * Get website configuration
   */
  async getConfig(): Promise<WebsiteConfig> {
    // Return the config from the file, with proper typing
    return {
      ...websiteConfig,
      deployment: {
        ...websiteConfig.deployment,
        type: websiteConfig.deployment.type as 'local-dev' | 'caddy',
      },
    } as WebsiteConfig;
  }
  
  /**
   * Get landing page data
   */
  async getLandingPageData(): Promise<LandingPageData | null> {
    return this.storage.getLandingPageData();
  }
  
  /**
   * Save landing page data
   */
  async saveLandingPageData(data: LandingPageData): Promise<void> {
    await this.storage.saveLandingPageData(data);
  }
  
  /**
   * Generate landing page from profile data
   */
  async generateLandingPage(
    options?: { useIdentity?: boolean; skipEdit?: boolean; onProgress?: (step: string, index: number) => void },
  ): Promise<{ success: boolean; message: string; data?: LandingPageData; status?: LandingPageGenerationStatus }> {
    try {
      const useIdentity = options?.useIdentity ?? false;
      const skipEdit = options?.skipEdit ?? true;
      
      this.logger.info('Generating landing page', { 
        useIdentity, 
        skipEdit,
        context: 'MCPWebsiteContext',
      });
      
      // Prepare identity data if requested
      let identityData: WebsiteIdentityData | null = null;
      if (useIdentity) {
        identityData = await this.getIdentity();
        if (!identityData) {
          this.logger.warn('Identity data requested but not available', { context: 'MCPWebsiteContext' });
        }
      }
      
      // Use LandingPageGenerationService to generate the page
      const { landingPage, generationStatus } = await this.landingPageGenerationService.generateLandingPageData(
        identityData || {} as WebsiteIdentityData,
        options?.onProgress,
      );
      
      if (!landingPage) {
        return {
          success: false,
          message: 'Failed to generate landing page',
          status: generationStatus,
        };
      }
      
      // Save the generated data
      await this.saveLandingPageData(landingPage);
      
      this.logger.info('Landing page generated successfully', {
        sectionCount: landingPage.sectionOrder.length,
        useIdentity,
        context: 'MCPWebsiteContext',
      });
      
      return {
        success: true,
        message: 'Landing page generated successfully',
        data: landingPage,
        status: generationStatus,
      };
    } catch (error) {
      this.logger.error('Error generating landing page', { error, context: 'MCPWebsiteContext' });
      return {
        success: false,
        message: `Error generating landing page: ${error}`,
      };
    }
  }
  
  /**
   * Edit landing page for consistency
   */
  async editLandingPage(useIdentity = true): Promise<{ success: boolean; message: string; data?: LandingPageData }> {
    try {
      // Get current landing page data
      const currentData = await this.getLandingPageData();
      if (!currentData) {
        return {
          success: false,
          message: 'No landing page data to edit',
        };
      }
      
      // Get identity data if requested
      let identityData: WebsiteIdentityData | null = null;
      if (useIdentity) {
        identityData = await this.getIdentity();
      }
      
      // Use service to edit the page
      const editedData = await this.landingPageGenerationService.editLandingPage(
        currentData,
        identityData,
      );
      
      if (!editedData) {
        return {
          success: false,
          message: 'Failed to edit landing page',
        };
      }
      
      // Save the edited data
      await this.saveLandingPageData(editedData);
      
      return {
        success: true,
        message: 'Landing page edited successfully',
        data: editedData,
      };
    } catch (error) {
      this.logger.error('Error editing landing page', { error, context: 'MCPWebsiteContext' });
      return {
        success: false,
        message: `Error editing landing page: ${error}`,
      };
    }
  }
  
  /**
   * Build website to preview environment
   */
  async buildWebsite(): Promise<{ success: boolean; message: string; output?: string }> {
    try {
      this.logger.info('Building website', { context: 'MCPWebsiteContext' });
      
      // Get landing page data
      const landingPageData = await this.getLandingPageData();
      if (!landingPageData) {
        return {
          success: false,
          message: 'No landing page data available to build',
        };
      }
      
      // Write landing page content to Astro project
      await this.astroContentService.writeLandingPageContent(landingPageData);
      
      // Build the Astro project
      const buildResult = await this.astroContentService.runAstroCommand('build');
      
      if (!buildResult.success) {
        return {
          success: false,
          message: 'Astro build failed',
          output: buildResult.output,
        };
      }
      
      this.logger.info('Website built successfully', { context: 'MCPWebsiteContext' });
      
      return {
        success: true,
        message: 'Website built successfully',
        output: buildResult.output,
      };
    } catch (error) {
      this.logger.error('Error building website', { error, context: 'MCPWebsiteContext' });
      return {
        success: false,
        message: `Error building website: ${error}`,
      };
    }
  }
  
  /**
   * Get website identity
   */
  async getIdentity(forceRegenerate = false): Promise<WebsiteIdentityData | null> {
    try {
      const result = await this.identityService.getIdentity(forceRegenerate);
      return result;
    } catch (error) {
      this.logger.error('Error getting website identity', { error, context: 'MCPWebsiteContext' });
      return null;
    }
  }
  
  /**
   * Generate website identity
   */
  async generateIdentity(): Promise<{ success: boolean; message: string; data?: WebsiteIdentityData }> {
    try {
      const data = await this.identityService.generateIdentity();
      return {
        success: true,
        message: 'Website identity generated successfully',
        data,
      };
    } catch (error) {
      this.logger.error('Error generating website identity', { error, context: 'MCPWebsiteContext' });
      return {
        success: false,
        message: `Error generating identity: ${error}`,
      };
    }
  }
  
  /**
   * Regenerate failed landing page sections
   */
  async regenerateFailedLandingPageSections(): Promise<{
    success: boolean;
    message: string;
    data?: LandingPageData;
    failedSections?: string[];
  }> {
    try {
      const currentData = await this.getLandingPageData();
      if (!currentData) {
        return {
          success: false,
          message: 'No landing page data available',
        };
      }
      
      const identity = await this.getIdentity();
      const regenerationResult = await this.landingPageGenerationService.regenerateFailedSections(
        currentData,
        identity || ({} as WebsiteIdentityData),
      );
      
      if (regenerationResult.success) {
        // The method doesn't return updated data, so we need to fetch it
        const updatedData = await this.getLandingPageData();
        if (updatedData) {
          return {
            success: true,
            message: regenerationResult.message,
            data: updatedData,
          };
        }
      }
      
      return {
        success: regenerationResult.success,
        message: regenerationResult.message,
        failedSections: regenerationResult.results.failed > 0 
          ? Object.entries(regenerationResult.results.sections)
            .filter(([_, result]) => !result.success)
            .map(([section]) => section)
          : undefined,
      };
    } catch (error) {
      this.logger.error('Error regenerating failed sections', { error, context: 'MCPWebsiteContext' });
      return {
        success: false,
        message: `Error regenerating sections: ${error}`,
      };
    }
  }
  
  /**
   * Get website deployment status
   */
  async getWebsiteStatus(environment: string = 'preview'): Promise<{ 
    status: string; 
    message: string; 
    url?: string;
    lastModified?: Date;
    fileCount?: number;
  }> {
    try {
      const envType = environment as 'preview' | 'live';
      const result = await this.deploymentManager.getEnvironmentStatus(envType);
      
      return {
        status: result.serverStatus,
        message: result.accessStatus,
        url: result.url,
        fileCount: result.fileCount,
      };
    } catch (error) {
      this.logger.error('Error getting website status', { error, context: 'MCPWebsiteContext' });
      return {
        status: 'error',
        message: `Error getting status: ${error}`,
      };
    }
  }
  
  /**
   * Promote website from preview to live
   */
  async promoteWebsite(): Promise<{ success: boolean; message: string; url?: string }> {
    try {
      const result = await this.deploymentManager.promoteToLive();
      
      if (!result.success) {
        return {
          success: false,
          message: result.message,
        };
      }
      
      // Start live server if needed
      if (this.deploymentManager.startServers) {
        await this.deploymentManager.startServers();
      }
      
      return {
        success: true,
        message: result.message,
        url: result.url,
      };
    } catch (error) {
      this.logger.error('Error promoting website', { error, context: 'MCPWebsiteContext' });
      return {
        success: false,
        message: `Error promoting website: ${error}`,
      };
    }
  }
  
  /**
   * Get deployment manager
   */
  getDeploymentManager(): WebsiteDeploymentManager {
    return this.deploymentManager;
  }
  
  /**
   * Handle website build request
   */
  async handleWebsiteBuild(): Promise<{ success: boolean; message: string; path?: string; url?: string }> {
    try {
      const buildResult = await this.buildWebsite();
      
      if (!buildResult.success) {
        return buildResult;
      }
      
      // Get the environment status
      const status = await this.getWebsiteStatus('preview');
      
      return {
        success: true,
        message: 'Website built successfully',
        path: websiteConfig.astroProjectPath,
        url: status.url,
      };
    } catch (error) {
      this.logger.error('Error handling website build', { error, context: 'MCPWebsiteContext' });
      return {
        success: false,
        message: `Error building website: ${error}`,
      };
    }
  }
  
  /**
   * Handle website promote request
   */
  async handleWebsitePromote(): Promise<{ success: boolean; message: string; url?: string }> {
    return this.promoteWebsite();
  }
  
  /**
   * Assess landing page quality
   */
  async assessLandingPage(options?: {
    useIdentity?: boolean;
    regenerateFailingSections?: boolean;
  }): Promise<{
    success: boolean;
    message: string;
    qualityAssessment?: {
      overallScore: number;
      sections: Record<string, AssessedSection<unknown>>;
      summary: string;
    };
    regenerationResult?: {
      success: boolean;
      message: string;
      data?: LandingPageData;
    };
  }> {
    try {
      const currentData = await this.getLandingPageData();
      if (!currentData) {
        return {
          success: false,
          message: 'No landing page data to assess',
        };
      }
      
      const identity = options?.useIdentity ? await this.getIdentity() : null;
      
      const assessmentResult = await this.landingPageGenerationService.assessLandingPageQuality(
        currentData,
        identity || ({} as WebsiteIdentityData),
        { applyRecommendations: false },
      );
      
      if (!assessmentResult) {
        return {
          success: false,
          message: 'Failed to assess landing page quality',
        };
      }
      
      // Optionally regenerate failing sections
      let regenerationResult;
      if (options?.regenerateFailingSections) {
        regenerationResult = await this.regenerateFailedLandingPageSections();
      }
      
      return {
        success: true,
        message: 'Landing page quality assessed successfully',
        qualityAssessment: assessmentResult.assessments ? {
          overallScore: 0, // We need to calculate this from assessments
          sections: assessmentResult.assessments,
          summary: 'Quality assessment completed',
        } : undefined,
        regenerationResult,
      };
    } catch (error) {
      this.logger.error('Error assessing landing page', { error, context: 'MCPWebsiteContext' });
      return {
        success: false,
        message: `Error assessing landing page: ${error}`,
      };
    }
  }
  
}