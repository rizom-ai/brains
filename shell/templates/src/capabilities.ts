import type { Template } from "./types";

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
   * Returns warnings if there are potential issues
   */
  static validate(template: Template): string[] {
    const warnings: string[] = [];

    // Check for basePrompt without AI dataSource
    if (template.basePrompt && !template.dataSourceId?.includes("ai-content")) {
      warnings.push(
        `Template "${template.name}" has basePrompt but no AI-content dataSourceId. It won't be able to generate content.`,
      );
    }

    // Check for AI dataSource without basePrompt
    if (template.dataSourceId?.includes("ai-content") && !template.basePrompt) {
      warnings.push(
        `Template "${template.name}" has AI-content dataSourceId but no basePrompt. Consider adding a basePrompt or using a different dataSource.`,
      );
    }

    // Check for formatter without any content source
    if (template.formatter && !template.basePrompt && !template.dataSourceId) {
      warnings.push(
        `Template "${template.name}" has a formatter but no content source (basePrompt or dataSourceId).`,
      );
    }

    // Check for interactive components without a dataSource
    if (template.layout?.interactive && !template.dataSourceId) {
      warnings.push(
        `Template "${template.name}" is marked as interactive but has no dataSourceId for dynamic data.`,
      );
    }

    return warnings;
  }

  /**
   * Log capability information for debugging
   */
  static logCapabilities(
    template: Template,
    logger?: { debug: (msg: string, meta?: any) => void },
  ): void {
    const caps = this.getCapabilities(template);
    const warnings = this.validate(template);

    const log = logger?.debug || console.log;

    log(`Template capabilities for "${template.name}":`, {
      ...caps,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  }
}
