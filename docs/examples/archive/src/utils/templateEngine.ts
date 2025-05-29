import { Logger } from './logger';

/**
 * Simple templating engine for prompt templates
 * Uses {{variable}} syntax for variables
 */
export class TemplateEngine {
  private static instance: TemplateEngine | null = null;
  private logger = Logger.getInstance();

  /**
   * Private constructor (singleton pattern)
   */
  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): TemplateEngine {
    if (!TemplateEngine.instance) {
      TemplateEngine.instance = new TemplateEngine();
    }
    return TemplateEngine.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  static resetInstance(): void {
    TemplateEngine.instance = null;
  }

  /**
   * Create a fresh instance (primarily for testing)
   */
  static createFresh(): TemplateEngine {
    return new TemplateEngine();
  }

  /**
   * Render a template with provided data
   * @param template The template string with {{variable}} placeholders
   * @param data Object containing variable values
   * @returns Rendered string with variables replaced
   */
  render(template: string, data: Record<string, unknown>): string {
    if (!template) {
      return '';
    }

    try {
      // Replace all {{variable}} instances with their values
      return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
        // Trim whitespace from the key
        const trimmedKey = key.trim();
        
        // Handle nested object paths (e.g. "user.name")
        if (trimmedKey.includes('.')) {
          return this.getNestedValue(data, trimmedKey) ?? match;
        }
        
        // Simple key lookup
        return data[trimmedKey] !== undefined ? String(data[trimmedKey]) : match;
      });
    } catch (error) {
      this.logger.error('Error rendering template', {
        error: error instanceof Error ? error.message : String(error),
        context: 'TemplateEngine',
      });
      return template; // Return original template on error
    }
  }

  /**
   * Get a nested value from an object using dot notation
   * @param obj The object to extract value from
   * @param path The path in dot notation (e.g. "user.profile.name")
   * @returns The value at the path or undefined if not found
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
    try {
      // Split the path into parts
      const keys = path.split('.');
      
      // Traverse the object
      let value: unknown = obj;
      for (const key of keys) {
        if (value === undefined || value === null) {
          return undefined;
        }
        
        if (typeof value !== 'object') {
          return undefined;
        }
        
        value = (value as Record<string, unknown>)[key];
      }
      
      // Convert to string or return undefined
      return value !== undefined ? String(value) : undefined;
    } catch (_error) {
      return undefined;
    }
  }

  /**
   * Render a template with conditionals
   * Uses {% if condition %} content {% endif %} syntax
   * Currently supports only simple variable existence checks
   * 
   * @param template The template string with conditionals
   * @param data Object containing variable values
   * @returns Rendered string with conditionals processed
   */
  renderWithConditionals(template: string, data: Record<string, unknown>): string {
    if (!template) {
      return '';
    }

    try {
      // First process conditionals
      const processedTemplate = this.processConditionals(template, data);
      
      // Then replace variables
      const renderedTemplate = this.render(processedTemplate, data);
      
      // Clean up line spacing by removing multiple consecutive empty lines
      return renderedTemplate.replace(/\n{3,}/g, '\n\n');
    } catch (error) {
      this.logger.error('Error rendering template with conditionals', {
        error: error instanceof Error ? error.message : String(error),
        context: 'TemplateEngine',
      });
      return template; // Return original template on error
    }
  }

  /**
   * Process conditionals in template
   * @param template Template with conditionals
   * @param data Data object
   * @returns Template with conditionals resolved
   */
  private processConditionals(template: string, data: Record<string, unknown>): string {
    // Process nested if statements multiple times to handle nesting
    let processedTemplate = template;
    let lastTemplate = '';
    
    // Keep processing until no more changes (handles nested conditionals)
    while (processedTemplate !== lastTemplate) {
      lastTemplate = processedTemplate;
      processedTemplate = this.processSingleLevelConditionals(lastTemplate, data);
    }
    
    return processedTemplate;
  }
  
  /**
   * Process a single level of conditionals in a template
   * @param template Template with conditionals
   * @param data Data object
   * @returns Template with one level of conditionals resolved
   */
  private processSingleLevelConditionals(template: string, data: Record<string, unknown>): string {
    // Basic if condition regex - non-greedy to handle nesting properly
    const conditionalRegex = /\{%\s*if\s+([^%]+)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
    
    return template.replace(conditionalRegex, (_match, condition, content) => {
      const trimmedCondition = condition.trim();
      let conditionMet = false;
      
      // Simple existence check for now
      if (trimmedCondition.includes('.')) {
        // Nested path check
        const value = this.getNestedValue(data, trimmedCondition);
        conditionMet = value !== undefined && value !== null && 
                      !(typeof value === 'boolean' && value === false) && 
                      !(typeof value === 'string' && value === '') && 
                      !(typeof value === 'number' && value === 0);
      } else {
        // Simple variable check
        const value = data[trimmedCondition];
        conditionMet = value !== undefined && value !== null && 
                      !(typeof value === 'boolean' && value === false) && 
                      !(typeof value === 'string' && value === '') && 
                      !(typeof value === 'number' && value === 0);
      }
      
      return conditionMet ? content : '';
    });
  }
}

export default TemplateEngine;