/**
 * Caddy Deployment Manager
 * 
 * Implementation of WebsiteDeploymentManager for Caddy server
 * Handles deployment to production servers with Caddy
 */

import config from '@/config';
import { Logger } from '@/utils/logger';

import type { EnvironmentStatus, PromotionResult, SiteEnvironment, WebsiteDeploymentManager } from './deploymentManager';

/**
 * Configuration options for CaddyDeploymentManager
 */
export interface CaddyDeploymentManagerOptions {
  baseDir?: string;
}

/**
 * Caddy implementation of WebsiteDeploymentManager
 * Uses Caddy for serving websites
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */
export class CaddyDeploymentManager implements WebsiteDeploymentManager {
  /**
   * Singleton instance
   */
  private static instance: CaddyDeploymentManager | null = null;
  
  /**
   * Get the singleton instance of CaddyDeploymentManager
   * 
   * Part of the Component Interface Standardization pattern.
   * 
   * @param options Configuration options
   * @returns The singleton instance
   */
  public static getInstance(options?: CaddyDeploymentManagerOptions): CaddyDeploymentManager {
    if (!CaddyDeploymentManager.instance) {
      CaddyDeploymentManager.instance = new CaddyDeploymentManager(options);
      
      const logger = Logger.getInstance();
      logger.debug('CaddyDeploymentManager singleton instance created');
    }
    
    return CaddyDeploymentManager.instance;
  }
  
  /**
   * Reset the singleton instance
   * 
   * Part of the Component Interface Standardization pattern.
   * Primarily used for testing to ensure a clean state.
   */
  public static resetInstance(): void {
    try {
      // No specific cleanup needed for this manager
      if (CaddyDeploymentManager.instance) {
        // Resource cleanup if needed
      }
    } catch (error) {
      const logger = Logger.getInstance();
      logger.error('Error during CaddyDeploymentManager instance reset:', error);
    } finally {
      CaddyDeploymentManager.instance = null;
      
      const logger = Logger.getInstance();
      logger.debug('CaddyDeploymentManager singleton instance reset');
    }
  }
  
  /**
   * Create a fresh CaddyDeploymentManager instance
   * 
   * Part of the Component Interface Standardization pattern.
   * Creates a new instance without affecting the singleton instance.
   * Primarily used for testing.
   * 
   * @param options Configuration options
   * @returns A new CaddyDeploymentManager instance
   */
  public static createFresh(options?: CaddyDeploymentManagerOptions): CaddyDeploymentManager {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh CaddyDeploymentManager instance');
    
    return new CaddyDeploymentManager(options);
  }
  
  /**
   * Create a new deployment manager with dependencies
   * 
   * Part of the Component Interface Standardization pattern.
   * This method follows the standard pattern for dependency injection.
   * 
   * @param configOrDependencies Configuration options or dependencies object
   * @returns A new CaddyDeploymentManager instance
   */
  public static createWithDependencies(
    configOrDependencies: Record<string, unknown> = {},
  ): CaddyDeploymentManager {
    const logger = Logger.getInstance();
    logger.debug('Creating CaddyDeploymentManager with dependencies');
    
    // For this manager, we don't have external dependencies, just configuration options
    // Convert generic config to our specific options type
    const options: CaddyDeploymentManagerOptions = {
      baseDir: configOrDependencies['baseDir'] as string,
    };
    
    return new CaddyDeploymentManager(options);
  }
  
  private readonly logger = Logger.getInstance();
  
  /**
   * Create a new CaddyDeploymentManager
   * 
   * Private constructor to enforce use of factory methods
   * Part of the Component Interface Standardization pattern
   * 
   * @param options Configuration options
   */
  private constructor(_options?: CaddyDeploymentManagerOptions) {
    // No need to store options as we use standard directories
  }
  
  /**
   * Get the status of an environment
   * @param environment The environment to check
   * @returns Status information for the environment
   */
  async getEnvironmentStatus(environment: SiteEnvironment): Promise<EnvironmentStatus> {
    try {
      // Import necessary modules
      const fs = await import('fs/promises');
      const path = await import('path');
      const childProcess = await import('child_process');
      const util = await import('util');
      const http = await import('http');
      
      // Define directory path for the actual files
      // In production, files are in dist/live (not baseDir/live/dist)
      const rootDir = process.cwd();
      const targetDir = environment === 'preview'
        ? path.join(rootDir, 'src', 'website', 'dist')
        : path.join(rootDir, 'dist', 'live');
      
      // Get domain based on environment
      const domain = this.getDomainForEnvironment(environment);
      // Use HTTP for localhost, HTTPS for real domains
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      const url = `${protocol}://${domain}`;
      
      // Check build status - look at the actual files in dist/live
      let buildStatus: 'Built' | 'Not Built' | 'Empty' = 'Not Built';
      let fileCount = 0;
      
      try {
        const stats = await fs.stat(targetDir);
        if (stats.isDirectory()) {
          const files = await fs.readdir(targetDir);
          fileCount = files.length;
          buildStatus = fileCount > 0 ? 'Built' : 'Empty';
        }
      } catch (_fsError) {
        // Directory doesn't exist
        buildStatus = 'Not Built';
        this.logger.warn(`Directory for ${environment} environment does not exist`, {
          directory: targetDir,
          context: 'CaddyDeploymentManager',
        });
      }
      
      // Check Caddy status - simplified to just check if running
      let serverStatus: 'Running' | 'Not Running' | 'Not Found' | 'Error' | 'Unknown' = 'Unknown';
      try {
        const execPromise = util.promisify(childProcess.exec);
        await execPromise('systemctl is-active --quiet caddy');
        serverStatus = 'Running';
      } catch (_error) {
        serverStatus = 'Not Running';
      }
      
      // Basic HTTP check to see if the site is accessible through the proxy
      let accessStatus = 'Unknown';
      
      try {
        // Simple check to see if the site responds to HTTP requests
        const checkUrl = new URL(url);
        
        const checkAccess = () => new Promise<string>((resolve) => {
          const options = {
            hostname: checkUrl.hostname,
            port: checkUrl.port || (protocol === 'https' ? 443 : 80),
            path: '/',
            method: 'HEAD',
            timeout: 3000,
          };
          
          const req = http.request(options, (res) => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
              resolve('Accessible');
            } else {
              resolve(`Error: HTTP ${res.statusCode}`);
            }
          });
          
          req.on('error', () => {
            resolve('Not Accessible');
          });
          
          req.on('timeout', () => {
            req.destroy();
            resolve('Timeout');
          });
          
          req.end();
        });
        
        accessStatus = await checkAccess();
      } catch {
        accessStatus = 'Error Checking';
      }
      
      this.logger.info(`Website status check completed for ${environment}`, {
        buildStatus,
        fileCount,
        serverStatus,
        accessStatus,
        context: 'CaddyDeploymentManager',
      });
      
      return {
        environment,
        buildStatus,
        fileCount,
        serverStatus,
        domain,
        accessStatus,
        url,
      };
    } catch (error) {
      this.logger.error('Error checking website status', {
        error,
        environment,
        context: 'CaddyDeploymentManager',
      });
      
      // Return a default error status
      const domain = this.getDomainForEnvironment(environment);
      // Use HTTP for localhost, HTTPS for real domains
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      
      return {
        environment,
        buildStatus: 'Not Built',
        fileCount: 0,
        serverStatus: 'Unknown',
        domain,
        accessStatus: 'Error',
        url: `${protocol}://${domain}`,
      };
    }
  }
  
  /**
   * Promote website from preview to live
   * @returns Result of the promotion operation
   */
  async promoteToLive(): Promise<PromotionResult> {
    try {
      // Import the necessary modules
      const fs = await import('fs/promises');
      const path = await import('path');
      const childProcess = await import('child_process');
      const util = await import('util');
      
      // Define directory paths - use the standard application directories
      const rootDir = process.cwd();
      const previewDir = path.join(rootDir, 'src', 'website', 'dist');
      const liveDir = path.join(rootDir, 'dist', 'live');
      
      // Get domain for live environment
      const liveDomain = this.getDomainForEnvironment('live');
      const protocol = liveDomain.includes('localhost') ? 'http' : 'https';
      
      // Verify the preview directory exists and has content
      try {
        const stats = await fs.stat(previewDir);
        if (!stats.isDirectory()) {
          throw new Error(`Preview directory ${previewDir} is not a directory`);
        }
        
        // Check if it has files
        const files = await fs.readdir(previewDir);
        if (files.length === 0) {
          throw new Error('Preview directory is empty. Please build the website first.');
        }
        
        // Ensure the live directory exists
        await fs.mkdir(path.dirname(liveDir), { recursive: true });
        
        // Remove existing live directory if it exists
        try {
          await fs.rm(liveDir, { recursive: true, force: true });
        } catch (_err) {
          // Directory doesn't exist, which is fine
        }
        
        // Create the live directory
        await fs.mkdir(liveDir, { recursive: true });
        
        // Use a single shell command for recursive directory copy
        const execPromise = util.promisify(childProcess.exec);
        
        // Simple command to copy all files and directories
        await execPromise(`cp -R ${previewDir}/* ${liveDir}/`);
        
        // Verify the copy worked
        const liveFiles = await fs.readdir(liveDir);
        
        // Check if index.html exists in the live directory
        const indexExists = await fs.stat(path.join(liveDir, 'index.html'))
          .then(stats => stats.isFile())
          .catch(() => false);
          
        if (!indexExists) {
          throw new Error('index.html not found in live directory after copy');
        }
        
        // Restart Caddy to pick up changes (only if running)
        try {
          // Check if Caddy is running
          const isCaddyRunning = await execPromise('systemctl is-active --quiet caddy')
            .then(() => true)
            .catch(() => false);
            
          if (isCaddyRunning) {
            // Try to restart Caddy
            await execPromise('systemctl restart caddy');
            this.logger.info('Restarted Caddy server', {
              context: 'CaddyDeploymentManager',
            });
          }
        } catch (caddyError) {
          this.logger.warn('Could not restart Caddy, but files were copied successfully', {
            error: caddyError,
            context: 'CaddyDeploymentManager',
          });
          // Continue even if Caddy operations fail
        }
        
        // Return success result
        const isDevMode = liveDomain.includes('localhost');
        const siteUrl = `${protocol}://${liveDomain}`;
        
        return {
          success: true,
          message: isDevMode
            ? `Preview successfully promoted to live site (${liveFiles.length} files). Available at ${siteUrl} (development mode)`
            : `Preview successfully promoted to live site (${liveFiles.length} files).`,
          url: siteUrl,
        };
      } catch (fsError) {
        throw new Error(`File system error during promotion: ${fsError instanceof Error ? fsError.message : String(fsError)}`);
      }
    } catch (error) {
      this.logger.error('Error promoting website to production', {
        error,
        context: 'CaddyDeploymentManager',
      });
      
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error promoting website',
      };
    }
  }
  
  /**
   * Get the domain for a specific environment
   * @param environment The environment to get the domain for
   * @returns The domain name
   */
  private getDomainForEnvironment(environment: SiteEnvironment): string {
    // Use the configuration from the imported config object
    const baseDomain = config.website.deployment.domain;
    
    // Use actual hostname with port for local development environments
    if (baseDomain === 'localhost' || baseDomain === 'example.com') {
      return environment === 'live'
        ? `localhost:${config.website.deployment.livePort}`
        : `localhost:${config.website.deployment.previewPort}`;
    }
    
    // For real domains, use subdomain for preview
    return environment === 'live' 
      ? baseDomain
      : `preview.${baseDomain}`;
  }
}