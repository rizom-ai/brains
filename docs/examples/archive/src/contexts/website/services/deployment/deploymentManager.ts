/**
 * Website Deployment Manager
 * 
 * Handles low-level operations for deploying websites
 */

import { Logger } from '@/utils/logger';

import { CaddyDeploymentManager } from './caddyDeploymentManager';
import { LocalDevDeploymentManager } from './localDevDeploymentManager';

/**
 * Site environment type
 */
export type SiteEnvironment = 'preview' | 'live';

/**
 * Status response for website environments
 */
export interface EnvironmentStatus {
  environment: SiteEnvironment;
  buildStatus: 'Built' | 'Not Built' | 'Empty';
  fileCount: number;
  serverStatus: 'Running' | 'Not Running' | 'Not Found' | 'Error' | 'Unknown';
  domain: string;
  accessStatus: string;
  url: string;
}

/**
 * Promotion result
 */
export interface PromotionResult {
  success: boolean;
  message: string;
  url?: string;
}

/**
 * Website deployment manager interface
 */
export interface WebsiteDeploymentManager {
  /**
   * Get the status of an environment
   * @param environment The environment to check
   * @returns Status information for the environment
   */
  getEnvironmentStatus(environment: SiteEnvironment): Promise<EnvironmentStatus>;
  
  /**
   * Promote website from preview to live
   * @returns Result of the promotion operation
   */
  promoteToLive(): Promise<PromotionResult>;
  
  /**
   * Start website servers
   * @returns Promise indicating success
   */
  startServers?(): Promise<boolean>;
  
  /**
   * Stop website servers
   */
  stopServers?(): Promise<void>;
}

/**
 * Factory for creating WebsiteDeploymentManager instances
 */
export interface DeploymentManagerOptions {
  baseDir?: string;
  deploymentType?: string;
  deploymentConfig?: {
    previewPort?: number;
    livePort?: number;
  };
}

/**
 * Interface for deployment manager classes that follow
 * the Component Interface Standardization pattern
 */
export interface DeploymentManager {
  // Static methods required by the Component Interface Standardization pattern
  getInstance(options?: DeploymentManagerOptions): WebsiteDeploymentManager;
  resetInstance(): void;
  createFresh(options?: DeploymentManagerOptions): WebsiteDeploymentManager;
  createWithDependencies?(config: Record<string, unknown>): WebsiteDeploymentManager;
}

/**
 * Factory for creating deployment manager instances
 */
export class DeploymentManagerFactory {
  private static instance: DeploymentManagerFactory | null = null;
  private deploymentManagerClass: DeploymentManager;
  
  /**
   * Constructor for DeploymentManagerFactory
   * @param deploymentManagerClass The deployment manager class to use
   */
  constructor(deploymentManagerClass?: DeploymentManager) {
    // Default to CaddyDeploymentManager if no class is provided
    this.deploymentManagerClass = deploymentManagerClass || CaddyDeploymentManager;
  }
  
  /**
   * Get the singleton instance
   */
  static getInstance(deploymentManagerClass?: DeploymentManager): DeploymentManagerFactory {
    if (!DeploymentManagerFactory.instance) {
      DeploymentManagerFactory.instance = new DeploymentManagerFactory(deploymentManagerClass);
    }
    return DeploymentManagerFactory.instance;
  }
  
  /**
   * Reset the singleton instance
   */
  static resetInstance(): void {
    DeploymentManagerFactory.instance = null;
  }
  
  /**
   * Create a fresh instance
   */
  static createFresh(deploymentManagerClass?: DeploymentManager): DeploymentManagerFactory {
    return new DeploymentManagerFactory(deploymentManagerClass);
  }
  
  /**
   * Set the deployment manager class
   * @param deploymentManagerClass The deployment manager class to use
   */
  setDeploymentManagerClass(deploymentManagerClass: DeploymentManager): void {
    this.deploymentManagerClass = deploymentManagerClass;
  }
  
  /**
   * Determine the appropriate deployment manager based on deployment type
   * @param deploymentType The deployment type from configuration
   * @returns The deployment manager class to use
   */
  selectDeploymentManager(deploymentType: string): DeploymentManager {
    const logger = Logger.getInstance();
    
    logger.info('Selecting deployment manager', {
      deploymentType,
      context: 'DeploymentManagerFactory',
    });
    
    if (deploymentType === 'local-dev') {
      logger.info('Selected LocalDevDeploymentManager', {
        context: 'DeploymentManagerFactory',
      });
      return LocalDevDeploymentManager;
    } else {
      logger.info('Selected CaddyDeploymentManager', {
        context: 'DeploymentManagerFactory',
      });
      return CaddyDeploymentManager;
    }
  }
  
  /**
   * Create a deployment manager instance
   * @param options Configuration options
   * @returns A WebsiteDeploymentManager implementation
   */
  create(options?: DeploymentManagerOptions): WebsiteDeploymentManager {
    // If deploymentType is provided, determine the appropriate manager class
    if (options?.deploymentType) {
      this.deploymentManagerClass = this.selectDeploymentManager(options.deploymentType);
    }
    
    // Create a fresh instance of the configured deployment manager class to avoid issues with cached state
    return this.deploymentManagerClass.createFresh(options);
  }
}