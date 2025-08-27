import type { Template } from "./types";
import type { Logger } from "@brains/utils";

/**
 * Utility class for detecting template capabilities
 * Helps determine what operations a template supports
 */
export class TemplateCapabilities {
  /**
   * Check if a template supports AI content generation
   * A template can generate if it has both basePrompt and an AI-content dataSourceId
   */
  static canGenerate(template: Template): boolean {
    return (
      !!template.basePrompt &&
      !!template.dataSourceId &&
      template.dataSourceId.includes("ai-content")
    );
  }

  /**
   * Check if a template supports data fetching
   * A template can fetch if it has a dataSourceId but isn't for generation
   */
  static canFetch(template: Template): boolean {
    return !!template.dataSourceId && !this.canGenerate(template);
  }

  /**
   * Check if a template supports view rendering
   * A template can render if it has a layout component
   */
  static canRender(template: Template): boolean {
    return !!template.layout?.component;
  }

  /**
   * Check if a template only supports static content
   * A template is static-only if it can't generate or fetch
   */
  static isStaticOnly(template: Template): boolean {
    return !this.canGenerate(template) && !this.canFetch(template);
  }

  /**
   * Get a summary of all capabilities for a template
   */
  static getCapabilities(template: Template): {
    canGenerate: boolean;
    canFetch: boolean;
    canRender: boolean;
    isStaticOnly: boolean;
  } {
    return {
      canGenerate: this.canGenerate(template),
      canFetch: this.canFetch(template),
      canRender: this.canRender(template),
      isStaticOnly: this.isStaticOnly(template),
    };
  }

  /**
   * Validate template capabilities for consistency
   * Returns errors only for actual misconfigurations
   */
  static validate(template: Template): string[] {
    const errors: string[] = [];

    // Only warn about actual misconfigurations, not different template types
    
    // Error: AI dataSource requires basePrompt to function
    if (template.dataSourceId?.includes("ai-content") && !template.basePrompt) {
      errors.push(
        `Template "${template.name}" has AI-content dataSourceId but no basePrompt. AI generation requires a basePrompt.`,
      );
    }

    // Error: basePrompt without AI dataSource won't be used
    if (template.basePrompt && (!template.dataSourceId || !template.dataSourceId.includes("ai-content"))) {
      errors.push(
        `Template "${template.name}" has basePrompt but no AI-content dataSourceId. The basePrompt won't be used.`,
      );
    }

    return errors;
  }

  /**
   * Log capability information for debugging
   */
  static logCapabilities(template: Template, logger?: Logger): void {
    const caps = this.getCapabilities(template);
    const errors = this.validate(template);

    if (logger) {
      logger.debug(`Template capabilities for "${template.name}":`, {
        ...caps,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  }
}
