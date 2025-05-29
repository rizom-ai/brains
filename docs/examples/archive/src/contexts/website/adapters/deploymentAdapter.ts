/**
 * Deployment adapter interface for website deployment
 * Handles actual server process management
 */

import config from '@/config';
import { Logger } from '@/utils/logger';

/**
 * Interface for deployment adapters
 */
export interface DeploymentAdapter {
  /**
   * Initialize the adapter
   */
  initialize(): Promise<boolean>;
  
  /**
   * Start servers for the given environment
   * @param environment The environment to start servers for (preview or live)
   * @param port The port to use for the server
   * @param directory The directory to serve
   * @param serverScript Optional script to use for the server
   */
  startServer(
    environment: 'preview' | 'live', 
    port: number, 
    directory: string,
    serverScript?: string
  ): Promise<boolean>;
  
  /**
   * Stop servers for the given environment
   * @param environment The environment to stop servers for (preview or live)
   */
  stopServer(environment: 'preview' | 'live'): Promise<boolean>;
  
  /**
   * Check if a server is running for the given environment
   * @param environment The environment to check
   * @returns true if the server is running, false otherwise
   */
  isServerRunning(environment: 'preview' | 'live'): Promise<boolean>;
  
  /**
   * Clean up all resources
   */
  cleanup(): Promise<void>;
  
  /**
   * Get the configuration for the deployment adapter
   * @returns Configuration object with deployment type and proxy settings
   */
  getDeploymentConfig(): {
    type: string;
    useReverseProxy: boolean;
    previewPort: number;
    livePort: number;
    domain: string;
  };
}

/**
 * Configuration options for PM2DeploymentAdapter
 */
export interface PM2DeploymentAdapterOptions {
  serverNames?: {
    preview: string;
    live: string;
  };
  defaultScripts?: {
    preview: string;
    live: string;
  };
  config?: {
    type: string;
    useReverseProxy: boolean;
    previewPort: number;
    livePort: number;
    domain: string;
  };
}

/**
 * PM2 implementation of the deployment adapter
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */
export class PM2DeploymentAdapter implements DeploymentAdapter {
  /**
   * Singleton instance
   */
  private static instance: PM2DeploymentAdapter | null = null;
  
  /**
   * Get the singleton instance of PM2DeploymentAdapter
   * 
   * Part of the Component Interface Standardization pattern.
   * 
   * @param options Configuration options
   * @returns The singleton instance
   */
  public static getInstance(options?: PM2DeploymentAdapterOptions): PM2DeploymentAdapter {
    if (!PM2DeploymentAdapter.instance) {
      PM2DeploymentAdapter.instance = new PM2DeploymentAdapter(options);
      
      const logger = Logger.getInstance();
      logger.debug('PM2DeploymentAdapter singleton instance created');
    }
    
    return PM2DeploymentAdapter.instance;
  }
  
  /**
   * Reset the singleton instance
   * 
   * Part of the Component Interface Standardization pattern.
   * Primarily used for testing to ensure a clean state.
   */
  public static resetInstance(): void {
    try {
      // Clean up resources if needed
      if (PM2DeploymentAdapter.instance) {
        // Stop any running servers
        PM2DeploymentAdapter.instance.cleanup().catch(error => {
          const logger = Logger.getInstance();
          logger.error('Error during cleanup on reset:', error);
        });
      }
    } catch (error) {
      const logger = Logger.getInstance();
      logger.error('Error during PM2DeploymentAdapter instance reset:', error);
    } finally {
      PM2DeploymentAdapter.instance = null;
      
      const logger = Logger.getInstance();
      logger.debug('PM2DeploymentAdapter singleton instance reset');
    }
  }
  
  /**
   * Create a fresh PM2DeploymentAdapter instance
   * 
   * Part of the Component Interface Standardization pattern.
   * Creates a new instance without affecting the singleton instance.
   * Primarily used for testing.
   * 
   * @param options Configuration options
   * @returns A new PM2DeploymentAdapter instance
   */
  public static createFresh(options?: PM2DeploymentAdapterOptions): PM2DeploymentAdapter {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh PM2DeploymentAdapter instance');
    
    return new PM2DeploymentAdapter(options);
  }
  
  /**
   * Create a new adapter with dependencies
   * 
   * Part of the Component Interface Standardization pattern.
   * This method follows the standard pattern for dependency injection.
   * 
   * @param configOrDependencies Configuration options or dependencies object
   * @returns A new PM2DeploymentAdapter instance
   */
  public static createWithDependencies(
    configOrDependencies: Record<string, unknown> = {},
  ): PM2DeploymentAdapter {
    const logger = Logger.getInstance();
    logger.debug('Creating PM2DeploymentAdapter with dependencies');
    
    // For this adapter, we just use the config directly as we don't have external dependencies
    // Convert generic config to our specific options type
    const options: PM2DeploymentAdapterOptions = {
      serverNames: configOrDependencies['serverNames'] as PM2DeploymentAdapterOptions['serverNames'],
      defaultScripts: configOrDependencies['defaultScripts'] as PM2DeploymentAdapterOptions['defaultScripts'],
      config: configOrDependencies['config'] as PM2DeploymentAdapterOptions['config'],
    };
    
    return new PM2DeploymentAdapter(options);
  }
  
  private readonly logger = Logger.getInstance();
  private initialized = false;
  
  /**
   * Default server names
   */
  private readonly serverNames = {
    preview: 'website-preview',
    live: 'website-live',
  };
  
  /**
   * Default server scripts - using direct Bun HTML file serving
   */
  private readonly defaultScripts = {
    preview: 'website:preview',
    live: 'website:live',
  };
  
  /**
   * Deployment configuration
   */
  protected readonly config = {
    type: config.website.deployment.type,
    useReverseProxy: config.website.deployment.type === 'caddy',
    previewPort: config.website.deployment.previewPort,
    livePort: config.website.deployment.livePort,
    domain: config.website.deployment.domain,
  };
  
  /**
   * Create a new PM2DeploymentAdapter
   * 
   * Private constructor to enforce use of factory methods
   * Part of the Component Interface Standardization pattern
   * 
   * @param options Configuration options
   */
  private constructor(options?: PM2DeploymentAdapterOptions) {
    // Apply configuration options if provided
    if (options?.serverNames) {
      this.serverNames = { ...this.serverNames, ...options.serverNames };
    }
    
    if (options?.defaultScripts) {
      this.defaultScripts = { ...this.defaultScripts, ...options.defaultScripts };
    }
    
    if (options?.config) {
      this.config = { ...this.config, ...options.config };
    }
    
    // IMPORTANT: We don't register any handlers here to avoid conflicts
    // All signal handlers are now consolidated in the main CLI and Matrix interfaces
    // Those handlers will call cleanup through the ServerManager when needed
  }
  
  /**
   * Initialize the adapter
   */
  async initialize(): Promise<boolean> {
    try {
      const { exec } = await import('child_process');
      const util = await import('util');
      const execPromise = util.promisify(exec);
      
      // Check if PM2 is available
      await execPromise('bun run pm2 --version');
      
      this.initialized = true;
      return true;
    } catch (error) {
      this.logger.error('Error initializing PM2DeploymentAdapter', {
        error,
        context: 'PM2DeploymentAdapter',
      });
      return false;
    }
  }
  
  /**
   * Start a server for the given environment
   */
  async startServer(
    environment: 'preview' | 'live', 
    port: number, 
    directory: string,
    serverScript?: string,
  ): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      const { exec } = await import('child_process');
      const util = await import('util');
      const execPromise = util.promisify(exec);
      
      // Use the provided script or default
      const script = serverScript || this.defaultScripts[environment];
      const serverName = this.serverNames[environment];
      
      // First stop any existing server
      await this.stopServer(environment);
      
      // Build the command
      let command: string;
      
      if (environment === 'preview') {
        // For preview, pass WEBSITE_PREVIEW_PORT environment variable to match what the script looks for
        // We explicitly do NOT include NODE_ENV=production to avoid PM2 issues with debug module
        command = `bun run pm2 start "bun run ${script}" --name ${serverName} --interpreter none --env WEBSITE_PREVIEW_PORT=${port}`;
      } else {
        // For live, pass WEBSITE_LIVE_PORT environment variable to match what the script looks for
        // We explicitly do NOT include NODE_ENV=production to avoid PM2 issues with debug module
        command = `bun run pm2 start "bun run ${script}" --name ${serverName} --interpreter none --env WEBSITE_LIVE_PORT=${port}`;
      }
      
      this.logger.info(`Starting ${environment} server on port ${port}`, {
        context: 'PM2DeploymentAdapter',
        directory,
        serverName,
      });
      
      await execPromise(command);
      return true;
    } catch (error) {
      this.logger.error(`Error starting ${environment} server`, {
        error,
        context: 'PM2DeploymentAdapter',
      });
      return false;
    }
  }
  
  /**
   * Stop a server for the given environment
   */
  async stopServer(environment: 'preview' | 'live'): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      const { exec } = await import('child_process');
      const util = await import('util');
      const execPromise = util.promisify(exec);
      
      const serverName = this.serverNames[environment];
      
      // Check if the server is running first
      const { stdout } = await execPromise('bun run pm2 list');
      
      if (stdout.includes(serverName)) {
        // Stop and delete the process
        this.logger.info(`Stopping ${environment} server`, {
          context: 'PM2DeploymentAdapter',
          serverName,
        });
        
        await execPromise(`bun run pm2 stop ${serverName} || true`);
        await execPromise(`bun run pm2 delete ${serverName} || true`);
        
        this.logger.info(`Stopped ${environment} server`, {
          context: 'PM2DeploymentAdapter',
        });
      } else {
        this.logger.info(`${environment} server is not running (no stop needed)`, {
          context: 'PM2DeploymentAdapter',
        });
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Error stopping ${environment} server`, {
        error,
        context: 'PM2DeploymentAdapter',
      });
      return false;
    }
  }
  
  /**
   * Check if a server is running for the given environment
   */
  async isServerRunning(environment: 'preview' | 'live'): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      const { exec } = await import('child_process');
      const util = await import('util');
      const execPromise = util.promisify(exec);
      
      const serverName = this.serverNames[environment];
      
      // Check PM2 list for the server
      const { stdout } = await execPromise('bun run pm2 list');
      
      // Check if the server is running and online
      return stdout.includes(serverName) && stdout.includes('online');
    } catch (error) {
      this.logger.error(`Error checking if ${environment} server is running`, {
        error,
        context: 'PM2DeploymentAdapter',
      });
      return false;
    }
  }
  
  /**
   * Clean up all resources
   */
  async cleanup(): Promise<void> {
    if (!this.initialized) {
      return;
    }
    
    try {
      this.logger.info('Cleaning up all servers', {
        context: 'PM2DeploymentAdapter',
      });
      
      // Stop all servers
      await this.stopServer('preview');
      await this.stopServer('live');
      
      this.logger.info('All servers cleaned up', {
        context: 'PM2DeploymentAdapter',
      });
    } catch (error) {
      this.logger.error('Error during cleanup', {
        error,
        context: 'PM2DeploymentAdapter',
      });
    }
  }
  /**
   * Get the configuration for the deployment adapter
   */
  getDeploymentConfig(): {
    type: string;
    useReverseProxy: boolean;
    previewPort: number;
    livePort: number;
    domain: string;
    } {
    return this.config;
  }
}

/**
 * Factory function to get a deployment adapter
 * @returns A deployment adapter instance
 */
export function getDeploymentAdapter(): DeploymentAdapter {
  return PM2DeploymentAdapter.getInstance();
}