import type { Template, GenerationContext } from "@brains/types";
import type { RouteDefinition, SectionDefinition } from "@brains/view-registry";
import type { ProgressInfo } from "./content-generator";

/**
 * Public interface for ContentGenerator
 * Used by plugins and for testing
 */
export interface ContentGenerator {
  /**
   * Register a reusable template
   */
  registerTemplate<T>(name: string, template: Template<T>): void;

  /**
   * Get a registered template
   */
  getTemplate(name: string): Template<unknown> | null;

  /**
   * List all available templates
   */
  listTemplates(): Template<unknown>[];

  /**
   * Generate content using a template with entity-aware context
   */
  generateContent<T = unknown>(
    templateName: string,
    context?: GenerationContext,
  ): Promise<T>;

  /**
   * Generate content for a specific route and section
   */
  generateWithRoute(
    route: RouteDefinition,
    section: SectionDefinition,
    progressInfo: ProgressInfo,
    additionalContext?: Record<string, unknown>,
  ): Promise<string>;

  /**
   * Format content using a template's formatter
   */
  formatContent<T = unknown>(
    templateName: string,
    data: T,
    options?: { truncate?: number },
  ): string;

  /**
   * Parse existing content using a template's formatter
   */
  parseContent<T = unknown>(templateName: string, content: string): T;
}
