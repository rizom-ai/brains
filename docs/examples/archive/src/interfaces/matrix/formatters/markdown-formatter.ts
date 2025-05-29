/**
 * Enhanced markdown formatter for Matrix messages
 * 
 * Provides richer formatting options for Matrix messages, including:
 * - Better markdown rendering
 * - Visual distinctions for bot messages
 * - Custom styling for different content types
 */

import { marked } from 'marked';

import { TextUtils } from '@/utils/textUtils';

// Define formatter options
export interface MarkdownFormatterOptions {
  imageRendering?: boolean;
  applyBotStyling?: boolean;
  enableCustomStyles?: boolean;
}

// Default options
const DEFAULT_OPTIONS: MarkdownFormatterOptions = {
  imageRendering: true,
  applyBotStyling: true,
  enableCustomStyles: true,
};

/**
 * Matrix Markdown Formatter
 * 
 * Provides enhanced markdown formatting for Matrix messages
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */
export class MatrixMarkdownFormatter {
  /**
   * Singleton instance of MatrixMarkdownFormatter
   * This property should be accessed only by getInstance(), resetInstance(), and createFresh()
   */
  private static instance: MatrixMarkdownFormatter | null = null;
  
  /**
   * Get the singleton instance of the formatter
   * 
   * Part of the Component Interface Standardization pattern.
   * 
   * @param options Optional formatter options
   * @returns The shared MatrixMarkdownFormatter instance
   */
  public static getInstance(): MatrixMarkdownFormatter {
    if (!MatrixMarkdownFormatter.instance) {
      MatrixMarkdownFormatter.instance = new MatrixMarkdownFormatter();
    }
    return MatrixMarkdownFormatter.instance;
  }
  
  /**
   * Reset the singleton instance
   * 
   * Part of the Component Interface Standardization pattern.
   * Primarily used for testing to ensure a clean state.
   */
  public static resetInstance(): void {
    MatrixMarkdownFormatter.instance = null;
  }
  
  /**
   * Create a fresh formatter instance
   * 
   * Part of the Component Interface Standardization pattern.
   * Creates a new instance without affecting the singleton instance.
   * Primarily used for testing.
   * 
   * @param options Optional formatter options
   * @returns A new MatrixMarkdownFormatter instance
   */
  public static createFresh(options?: Partial<MarkdownFormatterOptions>): MatrixMarkdownFormatter {
    return new MatrixMarkdownFormatter(options);
  }

  private options: MarkdownFormatterOptions;
  private marked: typeof marked;
  private textUtils: TextUtils;

  /**
   * Create a new MatrixMarkdownFormatter
   * 
   * While this constructor is public, it is recommended to use the factory methods
   * getInstance() or createFresh() instead to ensure consistent instance management.
   * 
   * @param options Optional formatter options
   */
  constructor(options: Partial<MarkdownFormatterOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    
    // Configure marked with default options
    this.marked = marked;
    
    // Initialize TextUtils instance
    this.textUtils = TextUtils.getInstance();
    
    // Set up standard marked options for code blocks
    this.marked.setOptions({
      gfm: true,        // GitHub Flavored Markdown
      breaks: true,     // Render line breaks as <br>
      pedantic: false,  // Conform to markdown.pl
      // Note: smartLists and smartypants options are not available in current marked type definition
    });
  }

  /**
   * Format markdown text to HTML with enhancements
   * 
   * @param markdown The markdown text to format
   * @returns Formatted HTML ready for Matrix display
   */
  format(markdown: string): string {
    // Convert markdown to HTML
    const markdownResult = this.marked.parse(markdown);
    let html = typeof markdownResult === 'string' 
      ? markdownResult 
      : markdownResult.toString();
    
    // Apply custom styling if enabled
    if (this.options.enableCustomStyles) {
      html = this.applyCustomStyles(html);
    }
    
    // Apply bot styling if enabled
    if (this.options.applyBotStyling) {
      html = this.applyBotStyling(html);
    }
    
    // Sanitize the HTML to prevent XSS
    return this.textUtils.sanitizeHtml(html);
  }

  /**
   * Apply custom styles to the HTML
   * 
   * @param html HTML content
   * @returns Styled HTML
   */
  private applyCustomStyles(html: string): string {
    // For Matrix, we need to minimize styling and just return the HTML
    // Matrix will handle most of the styling itself
    return html;
  }

  /**
   * Apply bot styling to make messages visually distinct
   * 
   * @param html HTML content
   * @returns HTML with bot styling
   */
  private applyBotStyling(html: string): string {
    // For Matrix client, we'll just return the HTML content without bot styling
    // Matrix handles bot message styling differently
    return html;
  }

  /**
   * Format a code block with basic formatting
   * 
   * @param code Code content
   * @param language Programming language (optional, for reference only)
   * @returns Formatted HTML
   */
  formatCodeBlock(code: string, language?: string): string {
    // Create code block with language if provided
    const markdown = '```' + (language || '') + '\n' + code + '\n```';
    return this.format(markdown);
  }

  /**
   * Format a citation block
   * 
   * @param source Source name
   * @param text Citation text
   * @param url Optional URL
   * @returns Formatted HTML
   */
  formatCitation(source: string, text: string, url?: string): string {
    let citation = `<div class="source-citation">
      <strong>Source: ${source}</strong>
      <p>${text}</p>`;
    
    if (url) {
      citation += `<a href="${url}" target="_blank">Read more</a>`;
    }
    
    citation += '</div>';
    
    return citation;
  }

  /**
   * Format an image with caption
   * 
   * @param src Image source URL
   * @param alt Alt text
   * @param caption Optional caption
   * @returns Formatted HTML
   */
  formatImage(src: string, alt: string, caption?: string): string {
    let imageHtml = `<div class="image-container">
      <img src="${src}" alt="${alt}" style="max-width: 100%; height: auto;">`;
    
    if (caption) {
      imageHtml += `<div class="image-caption" style="text-align: center; font-style: italic; margin-top: 4px;">${caption}</div>`;
    }
    
    imageHtml += '</div>';
    
    return imageHtml;
  }
}

