/**
 * Local Development Deployment Manager
 * 
 * Implementation of WebsiteDeploymentManager for local development
 * Uses simple file operations in local directories and PM2 for process management
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import { Logger } from '@/utils/logger';

import type { DeploymentAdapter } from '../../adapters/deploymentAdapter';
import { getDeploymentAdapter } from '../../adapters/deploymentAdapter';

import type { EnvironmentStatus, PromotionResult, SiteEnvironment, WebsiteDeploymentManager } from './deploymentManager';

/**
 * Configuration options for LocalDevDeploymentManager
 */
export interface LocalDevDeploymentManagerOptions {
  baseDir?: string;
  previewPort?: number;
  livePort?: number;
  deploymentConfig?: {
    previewPort?: number;
    livePort?: number;
  };
  deploymentAdapter?: DeploymentAdapter;
}

/**
 * Local development implementation of WebsiteDeploymentManager
 * Uses local directories for development and testing
 */
export class LocalDevDeploymentManager implements WebsiteDeploymentManager {
  /**
   * Singleton instance
   */
  private static instance: LocalDevDeploymentManager | null = null;
  
  /**
   * Get the singleton instance of LocalDevDeploymentManager
   * 
   * Part of the Component Interface Standardization pattern.
   * 
   * @param options Configuration options
   * @returns The singleton instance
   */
  public static getInstance(options?: LocalDevDeploymentManagerOptions): LocalDevDeploymentManager {
    if (!LocalDevDeploymentManager.instance) {
      LocalDevDeploymentManager.instance = new LocalDevDeploymentManager(options);
      
      const logger = Logger.getInstance();
      logger.debug('LocalDevDeploymentManager singleton instance created');
    }
    
    return LocalDevDeploymentManager.instance;
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
      if (LocalDevDeploymentManager.instance) {
        // Stop any running servers
        LocalDevDeploymentManager.instance.stopServers().catch(error => {
          const logger = Logger.getInstance();
          logger.error('Error stopping servers during reset:', error);
        });
      }
    } catch (error) {
      const logger = Logger.getInstance();
      logger.error('Error during LocalDevDeploymentManager instance reset:', error);
    } finally {
      LocalDevDeploymentManager.instance = null;
      
      const logger = Logger.getInstance();
      logger.debug('LocalDevDeploymentManager singleton instance reset');
    }
  }
  
  /**
   * Create a fresh LocalDevDeploymentManager instance
   * 
   * Part of the Component Interface Standardization pattern.
   * Creates a new instance without affecting the singleton instance.
   * Primarily used for testing.
   * 
   * @param options Configuration options
   * @returns A new LocalDevDeploymentManager instance
   */
  public static createFresh(options?: LocalDevDeploymentManagerOptions): LocalDevDeploymentManager {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh LocalDevDeploymentManager instance');
    
    return new LocalDevDeploymentManager(options);
  }
  
  /**
   * Create a new deployment manager with dependencies
   * 
   * Part of the Component Interface Standardization pattern.
   * This method follows the standard pattern for dependency injection.
   * 
   * @param configOrDependencies Configuration options or dependencies object
   * @returns A new LocalDevDeploymentManager instance
   */
  public static createWithDependencies(
    configOrDependencies: Record<string, unknown> = {},
  ): LocalDevDeploymentManager {
    const logger = Logger.getInstance();
    logger.debug('Creating LocalDevDeploymentManager with dependencies');
    
    // Handle case where dependencies are explicitly provided
    if ('deploymentAdapter' in configOrDependencies) {
      const dependencies = configOrDependencies as {
        deploymentAdapter?: DeploymentAdapter;
        baseDir?: string;
        previewPort?: number;
        livePort?: number;
        deploymentConfig?: {
          previewPort?: number;
          livePort?: number;
        };
      };
      
      // Create with explicit dependencies
      return new LocalDevDeploymentManager({
        deploymentAdapter: dependencies.deploymentAdapter,
        baseDir: dependencies.baseDir,
        previewPort: dependencies.previewPort,
        livePort: dependencies.livePort,
        deploymentConfig: dependencies.deploymentConfig,
      });
    }
    
    // Handle case where a config object is provided
    // Convert generic config to our specific config type
    const options: LocalDevDeploymentManagerOptions = {
      baseDir: configOrDependencies['baseDir'] as string,
      previewPort: configOrDependencies['previewPort'] as number,
      livePort: configOrDependencies['livePort'] as number,
      deploymentConfig: configOrDependencies['deploymentConfig'] as {
        previewPort?: number;
        livePort?: number;
      },
    };
    
    return new LocalDevDeploymentManager(options);
  }
  
  private readonly logger = Logger.getInstance();
  private readonly baseDir: string;
  private readonly deploymentAdapter: DeploymentAdapter;
  private readonly previewPort: number;
  private readonly livePort: number;

  /**
   * Create a new LocalDevDeploymentManager
   * 
   * Private constructor to enforce use of factory methods
   * Part of the Component Interface Standardization pattern
   * 
   * @param options Configuration options
   */
  private constructor(options?: LocalDevDeploymentManagerOptions) {
    this.baseDir = options?.baseDir || process.cwd();
    // Prefer deploymentConfig properties if provided, fall back to direct options for backward compatibility
    this.previewPort = options?.deploymentConfig?.previewPort || options?.previewPort || 4321;
    this.livePort = options?.deploymentConfig?.livePort || options?.livePort || 4322;
    
    // Use provided adapter or get a new one
    this.deploymentAdapter = options?.deploymentAdapter || getDeploymentAdapter();
  }
  
  /**
   * Start both preview and production servers using the deployment adapter
   * @returns Promise resolving to true if servers were started successfully
   */
  async startServers(): Promise<boolean> {
    try {
      // First make sure servers are stopped
      await this.stopServers();
      
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Define paths
      const rootDir = path.resolve(process.cwd());
      const liveDir = path.join(rootDir, 'dist', 'live');
      
      // Ensure live directory exists
      await fs.mkdir(liveDir, { recursive: true });
      
      // If no files exist in live site, create a placeholder using the template
      let hasFiles = false;
      try {
        const files = await fs.readdir(liveDir);
        hasFiles = files.length > 0;
      } catch (_error) {
        hasFiles = false;
      }
      
      if (!hasFiles) {
        this.logger.info('Creating placeholder in live site directory', {
          context: 'LocalDevDeploymentManager',
        });
        
        try {
          // Read the template file directly
          const templatePath = path.join(rootDir, 'src', 'contexts', 'website', 'services', 'deployment', 'liveTemplate.html');
          const template = await fs.readFile(templatePath, 'utf-8');
          
          // Write the template to the live directory
          await fs.writeFile(path.join(liveDir, 'index.html'), template);
        } catch (templateError) {
          this.logger.error('Error reading or writing template file', {
            error: templateError,
            context: 'LocalDevDeploymentManager',
          });
          // Create a basic HTML file as fallback
          await fs.writeFile(
            path.join(liveDir, 'index.html'), 
            '<html><body><h1>Live Site</h1><p>This is a placeholder. Your live site will appear here after promotion.</p></body></html>',
          );
        }
      }
      
      // Initialize the deployment adapter
      await this.deploymentAdapter.initialize();
      
      // Start the preview server
      const previewSuccess = await this.deploymentAdapter.startServer(
        'preview',
        this.previewPort,
        path.join(this.baseDir, 'src', 'website'),
      );
      
      // Start the live server
      const liveSuccess = await this.deploymentAdapter.startServer(
        'live',
        this.livePort,
        liveDir,
      );
      
      return previewSuccess && liveSuccess;
    } catch (error) {
      this.logger.error('Error starting local development servers', {
        error,
        context: 'LocalDevDeploymentManager',
      });
      return false;
    }
  }
  
  /**
   * Stop both preview and production servers managed by PM2
   */
  async stopServers(): Promise<void> {
    try {
      this.logger.info('Stopping website servers', {
        context: 'LocalDevDeploymentManager',
      });
      
      // Initialize the deployment adapter
      await this.deploymentAdapter.initialize();
      
      // Stop both servers
      await this.deploymentAdapter.stopServer('preview');
      await this.deploymentAdapter.stopServer('live');
    } catch (error) {
      this.logger.error('Error stopping servers', {
        error,
        context: 'LocalDevDeploymentManager',
      });
    }
  }
  
  /**
   * Get the status of an environment
   * @param environment The environment to check
   * @returns Status information for the environment
   */
  async getEnvironmentStatus(environment: SiteEnvironment): Promise<EnvironmentStatus> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Define target directory for this environment
      const rootDir = process.cwd();
      // For preview, use Astro's build output (src/website/dist)
      // For live, use dist/live
      const targetDir = environment === 'preview' 
        ? path.join(rootDir, 'src', 'website', 'dist')
        : path.join(rootDir, 'dist', 'live');
      
      // Check if directory exists and count files
      let buildStatus: 'Built' | 'Not Built' | 'Empty' = 'Not Built';
      let fileCount = 0;
      
      try {
        const stats = await fs.stat(targetDir);
        if (stats.isDirectory()) {
          // Count files recursively
          const files = await this.countFiles(targetDir);
          fileCount = files;
          buildStatus = fileCount > 0 ? 'Built' : 'Empty';
        }
      } catch (_e) {
        // Directory doesn't exist
        buildStatus = 'Not Built';
      }
      
      // Development server info
      const port = environment === 'preview' ? this.previewPort : this.livePort;
      const domain = `localhost:${port}`;
      
      // Check server status using the deployment adapter
      let serverStatus: 'Running' | 'Not Running' | 'Not Found' | 'Error' | 'Unknown' = 'Unknown';
      
      try {
        // Initialize the deployment adapter
        await this.deploymentAdapter.initialize();
        
        // Check if the server is running
        const isRunning = await this.deploymentAdapter.isServerRunning(environment);
        
        serverStatus = isRunning ? 'Running' : 'Not Found';
      } catch (adapterError) {
        this.logger.warn(`Error checking server status for ${environment}`, {
          error: adapterError,
          context: 'LocalDevDeploymentManager',
        });
        serverStatus = 'Error';
      }
      
      // Check port accessibility
      let accessStatus = 'Unknown';
      try {
        const { default: net } = await import('net');
        
        // Create a promise that resolves if connection is successful
        const checkPort = () => new Promise<boolean>((resolve) => {
          const socket = new net.Socket();
          
          // Set a timeout (2 seconds)
          const timeout = global.setTimeout(() => {
            socket.destroy();
            resolve(false);
          }, 2000);
          
          // Try to connect
          socket.connect(port, 'localhost', () => {
            global.clearTimeout(timeout);
            socket.destroy();
            resolve(true);
          });
          
          // Handle errors
          socket.on('error', () => {
            global.clearTimeout(timeout);
            resolve(false);
          });
        });
        
        const portAccessible = await checkPort();
        accessStatus = portAccessible ? 'Accessible' : 'Not accessible';
      } catch (accessErr) {
        accessStatus = 'Error checking';
        this.logger.warn(`Error checking port accessibility for ${environment}`, {
          error: accessErr,
          context: 'LocalDevDeploymentManager',
        });
      }
      
      // Create the status response
      return {
        environment,
        buildStatus,
        fileCount,
        serverStatus,
        domain,
        accessStatus,
        url: `http://${domain}`,
      };
    } catch (error) {
      this.logger.error('Error checking local environment status', { 
        error,
        environment,
        context: 'LocalDevDeploymentManager',
      });
      
      // Return a default error status
      return {
        environment,
        buildStatus: 'Not Built',
        fileCount: 0,
        serverStatus: 'Unknown',
        domain: `localhost:${environment === 'preview' ? this.previewPort : this.livePort}`,
        accessStatus: 'Unknown',
        url: `http://localhost:${environment === 'preview' ? this.previewPort : this.livePort}`,
      };
    }
  }
  
  /**
   * Promote website from preview to live
   * @returns Result of the promotion operation
   */
  async promoteToLive(): Promise<PromotionResult> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Define paths for local development - make sure we're using the correct paths
      const rootDir = process.cwd();
      // The preview site is built to src/website/dist by Astro build
      const previewDir = path.join(rootDir, 'src', 'website', 'dist');
      const liveDir = path.join(rootDir, 'dist', 'live');
      
      // Log the paths we're using
      this.logger.info('Promotion paths', {
        previewDir,
        liveDir,
        rootDir,
        context: 'LocalDevDeploymentManager',
      });
      
      // Check if preview directory exists and has content
      try {
        const previewStats = await fs.stat(previewDir);
        if (!previewStats.isDirectory()) {
          throw new Error(`Preview directory ${previewDir} is not a directory`);
        }
        
        // Count files in preview directory
        const fileCount = await this.countFiles(previewDir);
        if (fileCount === 0) {
          throw new Error('Preview directory is empty. Please build the website first.');
        }
        
        this.logger.info('Promoting website from preview to live site', {
          previewDir,
          liveDir,
          fileCount,
          context: 'LocalDevDeploymentManager',
        });
        
        // Ensure parent directories for live site exist
        const liveParentDir = path.dirname(liveDir);
        this.logger.info(`Creating parent directory: ${liveParentDir}`, {
          context: 'LocalDevDeploymentManager',
        });
        await fs.mkdir(liveParentDir, { recursive: true });
        
        // Check if live directory already exists
        try {
          const liveStats = await fs.stat(liveDir);
          if (liveStats.isDirectory()) {
            // Remove existing live directory
            this.logger.info('Removing existing live directory', {
              liveDir,
              context: 'LocalDevDeploymentManager',
            });
            
            await fs.rm(liveDir, { recursive: true, force: true });
          }
        } catch (_err) {
          // Directory doesn't exist, which is fine
          this.logger.info('Live directory does not exist yet (this is normal)', {
            context: 'LocalDevDeploymentManager',
          });
        }
        
        // Create live directory
        this.logger.info(`Creating live directory: ${liveDir}`, {
          context: 'LocalDevDeploymentManager',
        });
        await fs.mkdir(liveDir, { recursive: true });
        
        // Copy files using a shell command for better reliability
        const cp = await import('child_process');
        const util = await import('util');
        const exec = util.promisify(cp.exec);
        
        // First check if source directory exists and has files
        const dirExists = await fs.stat(previewDir).then(() => true).catch(() => false);
        if (!dirExists) {
          this.logger.error(`Preview directory ${previewDir} does not exist`, {
            context: 'LocalDevDeploymentManager',
          });
          throw new Error(`Preview directory ${previewDir} does not exist`);
        }
        
        const previewFiles = await fs.readdir(previewDir).catch(() => []);
        this.logger.info(`Found ${previewFiles.length} entries in preview directory`, {
          previewFiles,
          context: 'LocalDevDeploymentManager',
        });
        
        // Use cp -r command with explicit paths - but excluding the 'live' subdirectory
        const cpCommand = `find "${previewDir}" -maxdepth 1 -not -name live -not -path "${previewDir}" -exec cp -r {} "${liveDir}/" \\;`;
        this.logger.info(`Copying files using shell command: ${cpCommand}`, {
          context: 'LocalDevDeploymentManager',
        });
        
        try {
          // Execute the copy command using find to exclude the live directory
          await exec(cpCommand);
          this.logger.info('Files copied successfully using shell command', {
            context: 'LocalDevDeploymentManager',
          });
        } catch (cpError) {
          this.logger.error('Error copying files with shell command', {
            error: cpError,
            context: 'LocalDevDeploymentManager',
          });
          
          // Fall back to the recursive copy method
          this.logger.info('Falling back to recursive copy method', {
            context: 'LocalDevDeploymentManager',
          });
          await this.copyDirectory(previewDir, liveDir);
        }
        
        // Verify the files were copied
        const liveFileCount = await this.countFiles(liveDir);
        
        return {
          success: true,
          message: `Preview successfully promoted to live site (${liveFileCount} files). Available at http://localhost:${this.livePort}`,
          url: `http://localhost:${this.livePort}`,
        };
      } catch (fsError) {
        throw new Error(`File system error during promotion: ${fsError instanceof Error ? fsError.message : String(fsError)}`);
      }
    } catch (error) {
      this.logger.error('Error promoting website to live site in development mode', {
        error,
        context: 'LocalDevDeploymentManager',
      });
      
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error promoting website',
      };
    }
  }
  
  /**
   * Utility to copy a directory recursively
   */
  private async copyDirectory(source: string, destination: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    try {
      // Log debugging information
      this.logger.info('Copying directory', {
        source,
        destination,
        context: 'LocalDevDeploymentManager',
      });
    
      // Create destination directory
      await fs.mkdir(destination, { recursive: true });
      
      // Read source directory
      const entries = await fs.readdir(source, { withFileTypes: true });
      
      // Copy each entry
      for (const entry of entries) {
        try {
          const srcPath = path.join(source, entry.name);
          const destPath = path.join(destination, entry.name);
          
          // Skip live directory to avoid infinite recursion
          if (entry.isDirectory() && entry.name === 'live') {
            this.logger.info('Skipping live directory to avoid recursion', {
              context: 'LocalDevDeploymentManager',
            });
            continue;
          }
          
          if (entry.isDirectory()) {
            // Recursively copy subdirectories
            await this.copyDirectory(srcPath, destPath);
          } else {
            // Copy file
            this.logger.debug(`Copying file ${entry.name}`, {
              context: 'LocalDevDeploymentManager',
            });
            await fs.copyFile(srcPath, destPath);
          }
        } catch (entryError) {
          this.logger.error(`Error copying entry ${entry.name}`, {
            error: entryError,
            context: 'LocalDevDeploymentManager',
          });
          // Continue with other entries
        }
      }
    } catch (copyError) {
      this.logger.error('Error in copyDirectory', {
        error: copyError,
        source,
        destination,
        context: 'LocalDevDeploymentManager',
      });
      throw copyError;
    }
  }
  
  /**
   * Count files in a directory recursively
   */
  private async countFiles(directory: string): Promise<number> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    let count = 0;
    
    try {
      // Read directory
      const entries = await fs.readdir(directory, { withFileTypes: true });
      
      // Count each entry
      for (const entry of entries) {
        // Skip live directory to avoid recursion issues
        if (entry.isDirectory() && entry.name === 'live') {
          continue;
        }
        
        const entryPath = path.join(directory, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively count files in subdirectories
          count += await this.countFiles(entryPath);
        } else {
          // Count this file
          count++;
        }
      }
    } catch (error) {
      this.logger.warn(`Error counting files in ${directory}`, {
        error,
        context: 'LocalDevDeploymentManager',
      });
      // Return current count on error
    }
    
    return count;
  }
}