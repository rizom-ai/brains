import fs from 'fs/promises';
import path from 'path';

import { Logger } from '@/utils/logger';
import { getProjectRoot } from '@/utils/pathUtils';
// Import LandingPageData type from schema
import type { LandingPageData } from '@website/schemas';

/**
 * Configuration options for AstroContentService
 */
export interface AstroContentServiceConfig {
  /**
   * Path to the Astro project root
   * If not provided, will default to the website directory in the project root
   */
  astroProjectPath?: string;
}

// Type for the spawn function we'll use to run Astro commands
export type SpawnFunction = (options: {
  cmd: string[];
  cwd: string;
  stdout: 'pipe';
  stderr: 'pipe';
}) => {
  exited: Promise<number>;
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
};

// Test helper methods - will only be implemented in the mock
export interface AstroContentServiceTestHelpers {
  // For testing only
  setLandingPageData(data: LandingPageData | null): void;
}

/**
 * Service for managing Astro project and content collections
 * Follows the Component Interface Standardization pattern with 
 * getInstance/resetInstance/createFresh methods
 */
export class AstroContentService {
  /**
   * Singleton instance
   */
  private static instance: AstroContentService | null = null;
  
  /**
   * Path to content collection directory
   */
  private contentCollectionPath: string;
  
  /**
   * Logger instance
   */
  private logger = Logger.getInstance();
  
  /**
   * Function for spawning child processes
   */
  private spawnFunction: SpawnFunction;
  
  /**
   * Get the singleton instance
   * 
   * @param config Optional configuration options
   * @returns The singleton instance
   */
  public static getInstance(config: AstroContentServiceConfig = {}): AstroContentService {
    if (!AstroContentService.instance) {
      AstroContentService.instance = new AstroContentService(config);
      const logger = Logger.getInstance();
      logger.debug('AstroContentService singleton instance created');
    } else if (Object.keys(config).length > 0) {
      // Log at debug level if trying to get instance with different config
      const logger = Logger.getInstance();
      logger.debug('getInstance called with config but instance already exists. Config ignored.');
    }
    
    return AstroContentService.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance and any resources it holds
   */
  public static resetInstance(): void {
    AstroContentService.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * 
   * @param config Configuration options
   * @returns A new instance
   */
  public static createFresh(config: AstroContentServiceConfig = {}): AstroContentService {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh AstroContentService instance');
    
    return new AstroContentService(config);
  }
  
  /**
   * Protected constructor to prevent direct instantiation
   * @param config Configuration options
   */
  protected constructor(config: AstroContentServiceConfig = {}) {
    // Determine Astro project path
    const astroProjectPath = config.astroProjectPath || 
      path.join(getProjectRoot(), 'src', 'website');
    
    this.contentCollectionPath = path.join(astroProjectPath, 'src', 'content');
    
    // Default implementation using Bun.spawn with adapter for our SpawnFunction type
    this.spawnFunction = (options: { cmd: string[]; cwd: string; stdout: 'pipe'; stderr: 'pipe'; }) => {
      const process = Bun.spawn(options.cmd, {
        cwd: options.cwd,
        stdout: options.stdout,
        stderr: options.stderr,
      });
      return {
        exited: process.exited,
        stdout: process.stdout,
        stderr: process.stderr,
      };
    };
    
    this.logger.debug('AstroContentService initialized', {
      astroProjectPath,
      contentCollectionPath: this.contentCollectionPath,
    });
  }
  
  /**
   * Get the Astro project path
   * @returns The path to the Astro project
   */
  getAstroProjectPath(): string {
    // Extract the project path from the content collection path
    return path.dirname(path.dirname(this.contentCollectionPath));
  }
  
  /**
   * Set the spawn function (for testing)
   */
  setSpawnFunction(fn: SpawnFunction): void {
    this.spawnFunction = fn;
  }
  
  /**
   * Check if an Astro project exists at the specified path
   */
  async verifyAstroProject(): Promise<boolean> {
    try {
      // Check for key Astro files
      const astroProjectPath = this.getAstroProjectPath();
      const astroConfigPath = path.join(astroProjectPath, 'astro.config.mjs');
      const contentConfigPath = path.join(this.contentCollectionPath, 'config.ts');
      
      const astroConfigExists = await fs.access(astroConfigPath)
        .then(() => true)
        .catch(() => false);
      
      const contentConfigExists = await fs.access(contentConfigPath)
        .then(() => true)
        .catch(() => false);
      
      return astroConfigExists && contentConfigExists;
    } catch (error) {
      this.logger.error('Error verifying Astro project', { error, context: 'AstroContentService' });
      return false;
    }
  }
  
  /**
   * Write landing page data to the content collection
   */
  async writeLandingPageContent(data: LandingPageData): Promise<boolean> {
    try {
      // Ensure landing page directory exists
      const landingPageDir = path.join(this.contentCollectionPath, 'landingPage');
      await fs.mkdir(landingPageDir, { recursive: true });
      
      // Write data to profile.json
      const filePath = path.join(landingPageDir, 'profile.json');
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      
      return true;
    } catch (error) {
      this.logger.error('Error writing landing page content', { error, context: 'AstroContentService' });
      return false;
    }
  }
  
  /**
   * Read landing page data from the content collection
   */
  async readLandingPageContent(): Promise<LandingPageData | null> {
    try {
      const filePath = path.join(this.contentCollectionPath, 'landingPage', 'profile.json');
      
      const exists = await fs.access(filePath)
        .then(() => true)
        .catch(() => false);
      
      if (!exists) {
        return null;
      }
      
      const rawData = await fs.readFile(filePath, 'utf-8');
      const parsedData = JSON.parse(rawData);
      
      return parsedData as LandingPageData;
    } catch (error) {
      this.logger.error('Error reading landing page content', { error, context: 'AstroContentService' });
      return null;
    }
  }
  
  /**
   * Run an Astro command (build, etc.)
   * This is for commands that complete and exit
   */
  async runAstroCommand(command: string): Promise<{ success: boolean; output: string }> {
    try {
      // Only support the build command
      if (command !== 'build') {
        this.logger.warn('Only the build command is supported by runAstroCommand', 
          { context: 'AstroContentService' });
      }
      
      // Use Bun to run the Astro command
      const astroProjectPath = this.getAstroProjectPath();
      const proc = this.spawnFunction({
        cmd: ['bunx', 'astro', command, '--root', astroProjectPath],
        cwd: process.cwd(),
        stdout: 'pipe',
        stderr: 'pipe',
      });
      
      // Capture output
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      
      // Check exit code
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        throw new Error(`Astro ${command} failed with exit code ${exitCode}: ${stderr}`);
      }
      
      // Log any warnings
      if (stderr && !stderr.includes('Completed in')) {
        this.logger.warn(`Astro ${command} warnings`, { output: stderr, context: 'AstroContentService' });
      }
      
      return {
        success: true,
        output: stdout,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error running Astro ${command}`, { error, context: 'AstroContentService' });
      
      return {
        success: false,
        output: errorMessage,
      };
    }
  }
  
  /**
   * Get build directory path
   * Returns the appropriate build output directory for Astro
   */
  getBuildDir(): string {
    return path.join(this.getAstroProjectPath(), 'dist');
  }
}

export default AstroContentService;