/**
 * ExternalSourceFormatter implementation of the FormatterInterface
 * 
 * Provides formatting capabilities for ExternalSourceResult objects
 * into text, markdown, or other formats.
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 * - createWithDependencies(): Creates a new instance with explicit dependencies
 */

import type { FormatterInterface, FormattingOptions } from '@/contexts/formatterInterface';
import { Logger } from '@/utils/logger';

import type { ExternalSourceResult } from '../sources';

/**
 * Formatting options specific to external source results
 */
export interface ExternalSourceFormattingOptions extends FormattingOptions {
  /**
   * Format to output the results in
   */
  format?: 'text' | 'markdown' | 'html' | 'json';
  
  /**
   * Include source metadata in the output
   */
  includeMetadata?: boolean;
  
  /**
   * Include URL in the output
   */
  includeUrl?: boolean;
  
  /**
   * Include timestamp in the output
   */
  includeTimestamp?: boolean;
}

/**
 * Configuration options for ExternalSourceFormatter
 */
export interface ExternalSourceFormatterConfig {
  /**
   * Default format to use when not specified
   */
  defaultFormat?: 'text' | 'markdown' | 'html' | 'json';
}

/**
 * Dependencies for ExternalSourceFormatter
 */
export interface ExternalSourceFormatterDependencies {
  /**
   * Logger instance
   */
  logger?: Logger;
}

/**
 * Formatter for ExternalSourceResult objects
 */
export class ExternalSourceFormatter implements FormatterInterface<ExternalSourceResult[], string> {
  /** Logger instance */
  private readonly logger: Logger;
  
  /** Default format setting */
  private readonly defaultFormat: 'text' | 'markdown' | 'html' | 'json';
  
  /** Singleton instance */
  private static instance: ExternalSourceFormatter | null = null;
  
  /**
   * Get the singleton instance of ExternalSourceFormatter
   * @param config Optional configuration
   * @returns Shared instance of ExternalSourceFormatter
   */
  public static getInstance(config?: ExternalSourceFormatterConfig): ExternalSourceFormatter {
    if (!ExternalSourceFormatter.instance) {
      ExternalSourceFormatter.instance = new ExternalSourceFormatter(config);
    } else if (config) {
      // Log a warning if trying to get instance with different config
      const logger = Logger.getInstance();
      logger.warn('getInstance called with config but instance already exists. Config ignored.');
    }
    return ExternalSourceFormatter.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    ExternalSourceFormatter.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * @param config Optional configuration
   * @returns A new ExternalSourceFormatter instance
   */
  public static createFresh(config?: ExternalSourceFormatterConfig): ExternalSourceFormatter {
    return new ExternalSourceFormatter(config);
  }
  
  /**
   * Create a new formatter with explicit dependencies
   * @param config Configuration options
   * @param dependencies Service dependencies
   * @returns A new ExternalSourceFormatter instance
   */
  public static createWithDependencies(
    config: Record<string, unknown> = {},
    dependencies: Record<string, unknown> = {},
  ): ExternalSourceFormatter {
    // Convert config to typed config
    const formatterConfig: ExternalSourceFormatterConfig = {
      defaultFormat: config['defaultFormat'] as 'text' | 'markdown' | 'html' | 'json',
    };
    
    // Create with typed dependencies
    return new ExternalSourceFormatter(
      formatterConfig,
      {
        logger: dependencies['logger'] as Logger,
      },
    );
  }
  
  /**
   * Private constructor to enforce factory methods
   * @param config Optional configuration
   * @param dependencies Optional dependencies
   */
  private constructor(
    config?: ExternalSourceFormatterConfig,
    dependencies?: ExternalSourceFormatterDependencies,
  ) {
    this.defaultFormat = config?.defaultFormat || 'markdown';
    this.logger = dependencies?.logger || Logger.getInstance();
  }
  
  /**
   * Format external source results
   * 
   * @param data Array of ExternalSourceResult objects to format
   * @param options Formatting options
   * @returns Formatted string representation of the results
   */
  format(data: ExternalSourceResult[], options: ExternalSourceFormattingOptions = {}): string {
    if (!data || data.length === 0) {
      return 'No external source results found.';
    }
    
    try {
      // Use options.format if provided, otherwise use the instance's defaultFormat
      const format = options.format || this.defaultFormat;
      
      switch (format) {
      case 'text':
        return this.formatAsText(data, options);
      case 'html':
        return this.formatAsHtml(data, options);
      case 'json':
        return this.formatAsJson(data);
      case 'markdown':
      default:
        return this.formatAsMarkdown(data, options);
      }
    } catch (error) {
      this.logger.error(`Error formatting external source results: ${error instanceof Error ? error.message : String(error)}`);
      return 'Error formatting external source results.';
    }
  }
  
  /**
   * Format results as plain text
   */
  private formatAsText(results: ExternalSourceResult[], options: ExternalSourceFormattingOptions): string {
    const formatted = results.map(result => {
      let output = `${result.title}\n${'-'.repeat(result.title.length)}\n\n`;
      output += `${result.content}\n\n`;
      
      if (options.includeMetadata !== false) {
        output += `Source: ${result.source} (${result.sourceType})\n`;
      }
      
      if (options.includeUrl !== false) {
        output += `URL: ${result.url}\n`;
      }
      
      if (options.includeTimestamp) {
        output += `Retrieved: ${result.timestamp.toLocaleString()}\n`;
      }
      
      return output;
    });
    
    return formatted.join('\n' + '='.repeat(40) + '\n\n');
  }
  
  /**
   * Format results as Markdown
   */
  private formatAsMarkdown(results: ExternalSourceResult[], options: ExternalSourceFormattingOptions): string {
    const formatted = results.map(result => {
      let output = `## ${result.title}\n\n`;
      output += `${result.content}\n\n`;
      
      if (options.includeMetadata !== false) {
        output += `**Source:** ${result.source} (${result.sourceType})\n\n`;
      }
      
      if (options.includeUrl !== false) {
        output += `**URL:** [${result.title}](${result.url})\n\n`;
      }
      
      if (options.includeTimestamp) {
        output += `**Retrieved:** ${result.timestamp.toLocaleString()}\n\n`;
      }
      
      return output;
    });
    
    return formatted.join('---\n\n');
  }
  
  /**
   * Format results as HTML
   */
  private formatAsHtml(results: ExternalSourceResult[], options: ExternalSourceFormattingOptions): string {
    const formatted = results.map(result => {
      let output = '<div class="external-result">\n';
      output += `  <h2>${this.escapeHtml(result.title)}</h2>\n`;
      output += `  <div class="content">${this.escapeHtml(result.content)}</div>\n`;
      
      if (options.includeMetadata !== false) {
        output += '  <div class="metadata">\n';
        output += `    <p><strong>Source:</strong> ${this.escapeHtml(result.source)} (${this.escapeHtml(result.sourceType)})</p>\n`;
        
        if (options.includeUrl !== false) {
          output += `    <p><strong>URL:</strong> <a href="${this.escapeHtml(result.url)}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(result.title)}</a></p>\n`;
        }
        
        if (options.includeTimestamp) {
          output += `    <p><strong>Retrieved:</strong> ${result.timestamp.toLocaleString()}</p>\n`;
        }
        
        output += '  </div>\n';
      }
      
      output += '</div>';
      return output;
    });
    
    return formatted.join('\n<hr />\n');
  }
  
  /**
   * Format results as JSON
   */
  private formatAsJson(results: ExternalSourceResult[]): string {
    // Convert Date objects to ISO strings for proper JSON serialization
    const sanitizedResults = results.map(result => ({
      ...result,
      timestamp: result.timestamp.toISOString(),
      // Don't include embeddings in JSON output (they're large and not useful for display)
      embedding: undefined,
    }));
    
    return JSON.stringify(sanitizedResults, null, 2);
  }
  
  /**
   * Escape HTML special characters
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  
  /**
   * Format a single external source result
   * 
   * @param result The external source result to format
   * @param options Formatting options
   * @returns Formatted string representation of the result
   */
  formatSingleResult(result: ExternalSourceResult, options: ExternalSourceFormattingOptions = {}): string {
    try {
      return this.format([result], options);
    } catch (error) {
      this.logger.error(`Error formatting single external source result: ${error instanceof Error ? error.message : String(error)}`);
      return 'Error formatting external source result.';
    }
  }
}