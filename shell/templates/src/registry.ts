import type { Template } from "./types";
import type { Logger } from "@brains/utils";
import { TemplateCapabilities } from "./capabilities";

/**
 * Central template registry that stores and manages all templates
 * This is the single source of truth for template storage
 * Implements Component Interface Standardization pattern.
 */
export class TemplateRegistry {
  private static instance: TemplateRegistry | null = null;

  private templates = new Map<string, Template>();
  private logger?: Logger | undefined;

  /**
   * Get the singleton instance of TemplateRegistry
   */
  public static getInstance(logger?: Logger): TemplateRegistry {
    if (!TemplateRegistry.instance) {
      TemplateRegistry.instance = new TemplateRegistry(logger);
    }
    return TemplateRegistry.instance;
  }

  /**
   * Testing reset
   */
  public static resetInstance(): void {
    TemplateRegistry.instance = null;
  }

  /**
   * Isolated instance creation
   */
  public static createFresh(logger?: Logger): TemplateRegistry {
    return new TemplateRegistry(logger);
  }

  /**
   * Private constructor to enforce factory methods
   */
  private constructor(logger?: Logger | undefined) {
    this.logger = logger;
  }

  /**
   * Register a template in the central registry
   */
  register(name: string, template: Template): void {
    this.templates.set(name, template);
    
    // Check for configuration errors
    const errors = TemplateCapabilities.validate(template);
    if (errors.length > 0) {
      errors.forEach(error => {
        this.logger?.error(`Template configuration error: ${error}`);
      });
    }
    
    // Log capability information in debug mode
    TemplateCapabilities.logCapabilities(template, this.logger);
    
    this.logger?.debug(`Registered template: ${name}`);
  }

  /**
   * Get a template by name
   */
  get(name: string): Template | undefined {
    return this.templates.get(name);
  }

  /**
   * Get all templates as a Map
   */
  getAll(): Map<string, Template> {
    return new Map(this.templates);
  }

  /**
   * Check if a template exists
   */
  has(name: string): boolean {
    return this.templates.has(name);
  }

  /**
   * Get all template names
   */
  getNames(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Get all templates as an array
   */
  list(): Template[] {
    return Array.from(this.templates.values());
  }

  /**
   * Remove a template from the registry
   */
  unregister(name: string): boolean {
    const existed = this.templates.has(name);
    if (existed) {
      this.templates.delete(name);
      this.logger?.debug(`Unregistered template: ${name}`);
    }
    return existed;
  }

  /**
   * Clear all templates from the registry
   */
  clear(): void {
    const count = this.templates.size;
    this.templates.clear();
    this.logger?.debug(`Cleared ${count} templates from registry`);
  }

  /**
   * Get the number of registered templates
   */
  size(): number {
    return this.templates.size;
  }

  /**
   * Get templates by plugin ID
   */
  getPluginTemplates(pluginId: string): Template[] {
    const prefix = `${pluginId}:`;
    return Array.from(this.templates.entries())
      .filter(([name]) => name.startsWith(prefix))
      .map(([, template]) => template);
  }

  /**
   * Get template names by plugin ID
   */
  getPluginTemplateNames(pluginId: string): string[] {
    const prefix = `${pluginId}:`;
    return Array.from(this.templates.keys()).filter((name) =>
      name.startsWith(prefix),
    );
  }
}
