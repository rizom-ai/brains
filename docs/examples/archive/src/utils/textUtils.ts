/**
 * Text processing utilities
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */
import sanitizeHtmlLib from 'sanitize-html';

import { textConfig } from '@/config';

/**
 * Configuration interface for TextUtils
 */
export interface TextConfig {
  defaultChunkSize: number;
  defaultChunkOverlap: number;
  defaultMaxKeywords: number;
  defaultWordsPerMinute: number;
}

/**
 * Utility class for text processing functions
 */
export class TextUtils {
  /** The singleton instance */
  private static instance: TextUtils | null = null;
  
  /** Text configuration */
  private config: TextConfig;
  
  /**
   * Get the singleton instance of TextUtils
   * @param config Optional configuration for text utilities
   */
  public static getInstance(config?: Partial<TextConfig>): TextUtils {
    if (!TextUtils.instance) {
      TextUtils.instance = new TextUtils(config);
    }
    return TextUtils.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    TextUtils.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * @param config Optional configuration for text utilities
   */
  public static createFresh(config?: Partial<TextConfig>): TextUtils {
    return new TextUtils(config);
  }
  
  /**
   * Private constructor to enforce singleton pattern
   * @param config Configuration for text utilities (optional for testing)
   */
  private constructor(config?: Partial<TextConfig>) {
    // Merge default config with any provided overrides
    this.config = { ...textConfig, ...config };
  }
  
  /**
   * Update the configuration
   * @param config Partial configuration to update
   */
  public updateConfig(config: Partial<TextConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Clean and normalize text for embedding
   * @param text Text to prepare
   * @returns Cleaned text
   */
  public prepareText(text: string): string {
    return text
      .replace(/\s+/g, ' ')      // Replace multiple spaces with a single space
      .replace(/\n+/g, ' ')      // Replace newlines with spaces
      .trim();                   // Trim whitespace from beginning and end
  }
  
  /**
   * Chunk a long text into smaller pieces
   * @param text The text to chunk
   * @param chunkSize The approximate size of each chunk
   * @param overlap The number of characters to overlap between chunks
   * @returns An array of text chunks
   */
  public chunkText(
    text: string, 
    chunkSize: number = this.config.defaultChunkSize, 
    overlap: number = this.config.defaultChunkOverlap,
  ): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/(?<=[.!?])\s+/);
    
    let currentChunk = '';
    
    for (const sentence of sentences) {
      // If adding this sentence would exceed the chunk size and we already have some content
      if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk);
        // Start a new chunk with overlap
        const words = currentChunk.split(' ');
        const overlapWords = words.slice(Math.max(0, words.length - overlap / 5));
        currentChunk = overlapWords.join(' ') + ' ' + sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }
    
    // Add the last chunk if it has content
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }
  
  /**
   * Extract keywords from text
   * @param text Text to analyze
   * @param maxKeywords Maximum number of keywords to return
   * @returns Array of extracted keywords
   */
  public extractKeywords(text: string, maxKeywords: number = this.config.defaultMaxKeywords): string[] {
    // Remove markdown syntax, common words, keep only words > 4 chars
    const cleanedText = text
      .replace(/[#*_`>\\+\\=\\[\\]\\(\\)\\{\\}\\|]/g, ' ')
      .toLowerCase();
    
    // Split into words and filter
    const words = cleanedText.split(/\s+/);
    const commonWords = new Set([
      'the', 'and', 'that', 'have', 'for', 'not', 'with', 'you', 'this', 'but',
    ]);
    
    return [...new Set(
      words.filter(word => 
        word.length > 4 && !commonWords.has(word),
      ),
    )].slice(0, maxKeywords);
  }
  
  /**
   * Sanitize HTML to prevent XSS attacks
   * @param html HTML string to sanitize
   * @returns Sanitized HTML string
   */
  public sanitizeHtml(html: string): string {
    try {
      // Configure allowed tags and attributes
      const allowedTags = [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'blockquote', 'p', 'a', 'ul', 'ol', 'nl', 'li',
        'b', 'i', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
        'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre',
        'span', 'img',
      ];
      
      const allowedAttributes = {
        a: ['href', 'title', 'target'],
        img: ['src', 'alt', 'title', 'width', 'height'],
        div: ['class'],
        span: ['class'],
        table: ['border', 'cellpadding', 'cellspacing'],
        // Allow class on all elements
        '*': ['class'],
      };
      
      // Sanitize the HTML with our configuration
      return sanitizeHtmlLib(html, {
        allowedTags,
        allowedAttributes,
        allowedSchemes: ['http', 'https', 'mailto'],
      });
    } catch {
      // Fallback to basic sanitization if the library isn't available
      
      // Remove script tags and their content
      let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      
      // Remove event handlers
      sanitized = sanitized.replace(/\s+on\w+=['"][^'"]*['"]/gi, '');
      
      // Remove iframe, object, embed
      const dangerousTags = [
        'iframe', 'object', 'embed', 'base', 'form', 
        'input', 'button', 'textarea', 'select', 'option',
      ];
      
      for (const tag of dangerousTags) {
        const regex = new RegExp(`<${tag}\\b[^<]*(?:(?!<\\/${tag}>)<[^<]*)*<\\/${tag}>`, 'gi');
        sanitized = sanitized.replace(regex, '');
        sanitized = sanitized.replace(new RegExp(`<${tag}\\b[^>]*\\/>`, 'gi'), '');
      }
      
      // Remove data: and javascript: URLs
      sanitized = sanitized.replace(/\bsrc\s*=\s*["'](?:data|javascript):[^"']*["']/gi, '');
      sanitized = sanitized.replace(/\bhref\s*=\s*["'](?:data|javascript):[^"']*["']/gi, '');
      
      return sanitized;
    }
  }
  
  /**
   * Calculate the approximate reading time for a text
   * @param text The text to analyze
   * @param wordsPerMinute Average reading speed (default: 200 words per minute)
   * @returns Estimated reading time in minutes
   */
  public calculateReadingTime(text: string, wordsPerMinute: number = this.config.defaultWordsPerMinute): number {
    const wordCount = text.split(/\s+/).length;
    return Math.ceil(wordCount / wordsPerMinute);
  }
}

// Export the TextConfig interface and TextUtils class
// Clients should use the TextUtils class directly through its getInstance() or createFresh() methods