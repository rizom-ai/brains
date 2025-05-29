/**
 * Renderer Registry
 * 
 * Centralizes access to renderers across different interface types
 * following the Component Interface Standardization pattern.
 */

import { Logger } from '../logger';

/**
 * Interface types supported by the system
 */
export type RendererInterfaceType = 'cli' | 'matrix';

/**
 * Interface for progress tracking across renderers
 */
export interface IProgressTracker {
  /**
   * Execute a task with step-by-step progress tracking
   * 
   * @param title Title of the operation
   * @param steps Array of step labels
   * @param task Async function to execute with progress tracking
   * @param roomId Optional room ID for Matrix renderer (ignored by CLI)
   * @returns Promise resolving to the result of the task
   */
  withProgress<T = unknown>(
    title: string,
    steps: string[],
    task: (updateStep: (stepIndex: number) => void) => Promise<T>,
    roomId?: string
  ): Promise<T>;
}

/**
 * Registry for managing renderers across different interface types
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance
 * - createFresh(): Creates a new instance without affecting the singleton
 */
export class RendererRegistry {
  private static instance: RendererRegistry | null = null;
  private renderers: Map<RendererInterfaceType, unknown> = new Map();
  private logger = Logger.getInstance();

  /**
   * Get the singleton instance of RendererRegistry
   * 
   * @returns The shared RendererRegistry instance
   */
  public static getInstance(): RendererRegistry {
    if (!RendererRegistry.instance) {
      RendererRegistry.instance = new RendererRegistry();
    }
    return RendererRegistry.instance;
  }

  /**
   * Reset the singleton instance
   * This is primarily used for testing
   */
  public static resetInstance(): void {
    RendererRegistry.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   * Primarily used for testing
   * 
   * @returns A new RendererRegistry instance
   */
  public static createFresh(): RendererRegistry {
    return new RendererRegistry();
  }

  /**
   * Private constructor to enforce the use of getInstance() or createFresh()
   */
  private constructor() {
    this.logger.debug('RendererRegistry initialized');
  }

  /**
   * Register a renderer for a specific interface type
   * 
   * @param interfaceType The interface type (cli, matrix, etc.)
   * @param renderer The renderer instance
   */
  registerRenderer(interfaceType: RendererInterfaceType, renderer: unknown): void {
    this.renderers.set(interfaceType, renderer);
    this.logger.debug(`Registered renderer for interface type: ${interfaceType}`);
  }

  /**
   * Get the renderer for a specific interface type
   * 
   * @param interfaceType The interface type (cli, matrix, etc.)
   * @returns The renderer instance or null if not found
   */
  getRenderer(interfaceType: RendererInterfaceType): unknown {
    const renderer = this.renderers.get(interfaceType);
    if (!renderer) {
      this.logger.debug(`No renderer found for interface type: ${interfaceType}`);
    }
    return renderer || null;
  }

  /**
   * Check if a renderer is registered for a specific interface type
   * 
   * @param interfaceType The interface type (cli, matrix, etc.)
   * @returns Whether a renderer is registered for the interface type
   */
  hasRenderer(interfaceType: RendererInterfaceType): boolean {
    return this.renderers.has(interfaceType);
  }

  /**
   * Get the progress tracker for a specific interface type
   * 
   * @param interfaceType The interface type (cli, matrix, etc.)
   * @returns The progress tracker or null if not found or not implementing IProgressTracker
   */
  getProgressTracker(interfaceType: RendererInterfaceType): IProgressTracker | null {
    const renderer = this.getRenderer(interfaceType);
    
    // Create a type guard for renderers that implement IProgressTracker
    const hasProgressTracker = (obj: unknown): obj is IProgressTracker => {
      return obj !== null && typeof obj === 'object' && 'withProgress' in obj && 
             typeof (obj as IProgressTracker).withProgress === 'function';
    };
    
    if (renderer && hasProgressTracker(renderer)) {
      return {
        withProgress: <T>(
          title: string,
          steps: string[],
          task: (updateStep: (stepIndex: number) => void) => Promise<T>,
          roomId?: string,
        ): Promise<T> => {
          return renderer.withProgress(title, steps, task, roomId);
        },
      };
    }
    
    return null;
  }
}