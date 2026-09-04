import type { Template } from "./types";
import type { Logger } from "@brains/utils/logger";
import { TemplateCapabilities } from "./capabilities";

/**
 * The template registry as consumers use it.
 *
 * They depend on this rather than on `InMemoryTemplateRegistry`: the class has
 * private state and a private constructor, so nothing else can be assignable
 * to it — which is why every test double had to be asserted into place.
 */
export interface TemplateRegistry {
  register(name: string, template: Template): void;
  get(name: string): Template | undefined;
  getAll(): Map<string, Template>;
  has(name: string): boolean;
  getNames(): string[];
  list(): Template[];
  unregister(name: string): boolean;
  clear(): void;
  size(): number;
  getPluginTemplates(pluginId: string): Template[];
  getPluginTemplateNames(pluginId: string): string[];
}

/**
 * Central template registry that stores and manages all templates.
 * This is the single source of truth for template storage.
 */
export class InMemoryTemplateRegistry implements TemplateRegistry {
  private templates = new Map<string, Template>();
  private logger: Logger | undefined;

  /**
   * Isolated instance creation
   */
  public static createFresh(logger?: Logger): InMemoryTemplateRegistry {
    return new InMemoryTemplateRegistry(logger);
  }

  /**
   * Private constructor to enforce factory methods
   */
  private constructor(logger?: Logger) {
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
      errors.forEach((error) => {
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
