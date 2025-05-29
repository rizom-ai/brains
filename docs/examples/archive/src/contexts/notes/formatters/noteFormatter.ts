/**
 * NoteFormatter class
 * 
 * Responsible for formatting note data into different output formats
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 * 
 * Implements the FormatterInterface for consistent formatting operations
 */
import type { FormatterInterface } from '@/contexts/formatterInterface';
import type { Note } from '@/models/note';
import { Logger } from '@/utils/logger';
import { isNonEmptyString } from '@/utils/safeAccessUtils';

/**
 * Formatting options for notes
 */
export interface NoteFormattingOptions {
  /**
   * Format to output
   */
  format?: 'text' | 'markdown' | 'json' | 'html';
  
  /**
   * Whether to include timestamps
   */
  includeTimestamps?: boolean;
  
  /**
   * Whether to include metadata
   */
  includeMetadata?: boolean;
  
  /**
   * Maximum content length to display
   */
  maxContentLength?: number;
  
  /**
   * Whether to format tags with hash symbols
   */
  formatTags?: boolean;
}

/**
 * NoteFormatter handles converting note objects to human-readable text
 * Follows the Component Interface Standardization pattern
 * Implements FormatterInterface for Note objects
 */
export class NoteFormatter implements FormatterInterface<Note, string> {
  /** The singleton instance */
  private static instance: NoteFormatter | null = null;
  
  /** Logger instance for this class */
  private logger = Logger.getInstance();
  
  /**
   * Get the singleton instance of NoteFormatter
   * 
   * @returns The shared NoteFormatter instance
   */
  public static getInstance(): NoteFormatter {
    if (!NoteFormatter.instance) {
      NoteFormatter.instance = new NoteFormatter();
    }
    return NoteFormatter.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance and any resources it holds
   */
  public static resetInstance(): void {
    NoteFormatter.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * 
   * @returns A new NoteFormatter instance
   */
  public static createFresh(): NoteFormatter {
    return new NoteFormatter();
  }
  
  /**
   * Format method implementing FormatterInterface
   * Maps to formatNoteForDisplay for compatibility
   * 
   * @param data The note data to format
   * @param options Optional formatting options
   * @returns Formatted string representation of the note
   */
  format(data: Note, options?: NoteFormattingOptions): string {
    return this.formatNoteForDisplay(data, options || {});
  }
  
  /**
   * Format a note for display
   * 
   * @param note The note to format
   * @param options Formatting options
   * @returns Formatted note string
   */
  formatNoteForDisplay(note: Note, options: NoteFormattingOptions = {}): string {
    try {
      const { 
        format = 'text',
        includeTimestamps = true,
        includeMetadata = false,
        maxContentLength = 0,
        formatTags = true,
      } = options;
      
      // Helper function to truncate content if needed
      const formatContent = (content: string): string => {
        if (!content) return '';
        
        if (maxContentLength > 0 && content.length > maxContentLength) {
          return content.substring(0, maxContentLength) + '...';
        }
        
        return content;
      };
      
      // Helper function to format tags
      const formatTagsList = (tags: string[] | null | undefined): string => {
        if (!tags || tags.length === 0) return '';
        
        return formatTags 
          ? tags.map(tag => `#${tag}`).join(' ')
          : tags.join(', ');
      };
      
      // Format based on requested output format
      switch (format) {
      case 'markdown':
        return this.formatNoteAsMarkdown(note, {
          includeTimestamps,
          includeMetadata,
          formatContent,
          formatTagsList,
        });
          
      case 'html':
        return this.formatNoteAsHtml(note, {
          includeTimestamps,
          includeMetadata,
          formatContent,
          formatTagsList,
        });
          
      case 'json':
        return this.formatNoteAsJson(note, {
          includeTimestamps,
          includeMetadata,
        });
          
      case 'text':
      default:
        return this.formatNoteAsText(note, {
          includeTimestamps,
          includeMetadata,
          formatContent,
          formatTagsList,
        });
      }
    } catch (error) {
      this.logger.error('Error formatting note:', { error, context: 'NoteFormatter' });
      return 'Error formatting note.';
    }
  }
  
  /**
   * Format note as plain text
   */
  private formatNoteAsText(
    note: Note,
    options: {
      includeTimestamps: boolean;
      includeMetadata: boolean;
      formatContent: (content: string) => string;
      formatTagsList: (tags: string[] | null | undefined) => string;
    },
  ): string {
    const { includeTimestamps, includeMetadata, formatContent, formatTagsList } = options;
    
    let result = '';
    
    // Title
    if (isNonEmptyString(note.title)) {
      result += `${note.title}\n${'='.repeat(note.title.length)}\n\n`;
    }
    
    // Timestamps
    if (includeTimestamps && note.createdAt) {
      result += `Created: ${new Date(note.createdAt).toLocaleString()}\n`;
      
      if (note.updatedAt) {
        result += `Updated: ${new Date(note.updatedAt).toLocaleString()}\n`;
      }
      
      result += '\n';
    }
    
    // Content
    if (isNonEmptyString(note.content)) {
      result += `${formatContent(note.content)}\n\n`;
    }
    
    // Tags
    const formattedTags = formatTagsList(note.tags);
    if (formattedTags) {
      result += `Tags: ${formattedTags}\n\n`;
    }
    
    // Metadata
    if (includeMetadata) {
      result += `ID: ${note.id}\n`;
      
      if (note.source) {
        result += `Source: ${note.source}\n`;
      }
      
      if (note.conversationMetadata?.conversationId) {
        result += `Conversation ID: ${note.conversationMetadata.conversationId}\n`;
      }
    }
    
    return result.trim();
  }
  
  /**
   * Format note as markdown
   */
  private formatNoteAsMarkdown(
    note: Note,
    options: {
      includeTimestamps: boolean;
      includeMetadata: boolean;
      formatContent: (content: string) => string;
      formatTagsList: (tags: string[] | null | undefined) => string;
    },
  ): string {
    const { includeTimestamps, includeMetadata, formatContent, formatTagsList } = options;
    
    let result = '';
    
    // Title
    if (isNonEmptyString(note.title)) {
      result += `# ${note.title}\n\n`;
    }
    
    // Timestamps
    if (includeTimestamps && note.createdAt) {
      result += `_Created: ${new Date(note.createdAt).toLocaleString()}_  \n`;
      
      if (note.updatedAt) {
        result += `_Updated: ${new Date(note.updatedAt).toLocaleString()}_  \n`;
      }
      
      result += '\n';
    }
    
    // Content
    if (isNonEmptyString(note.content)) {
      result += `${formatContent(note.content)}\n\n`;
    }
    
    // Tags
    const formattedTags = formatTagsList(note.tags);
    if (formattedTags) {
      result += `**Tags**: ${formattedTags}\n\n`;
    }
    
    // Metadata
    if (includeMetadata) {
      result += '---\n\n';
      result += `**ID**: \`${note.id}\`\n\n`;
      
      if (note.source) {
        result += `**Source**: ${note.source}\n\n`;
      }
      
      // sourceUrl and sourceId are no longer part of the Note type
      // These fields were likely removed in a schema update
    }
    
    return result.trim();
  }
  
  /**
   * Format note as HTML
   */
  private formatNoteAsHtml(
    note: Note,
    options: {
      includeTimestamps: boolean;
      includeMetadata: boolean;
      formatContent: (content: string) => string;
      formatTagsList: (tags: string[] | null | undefined) => string;
    },
  ): string {
    const { includeTimestamps, includeMetadata, formatContent, formatTagsList } = options;
    
    let result = '<div class="note">';
    
    // Title
    if (isNonEmptyString(note.title)) {
      result += `<h1>${note.title}</h1>`;
    }
    
    // Timestamps
    if (includeTimestamps && note.createdAt) {
      result += '<p class="timestamps">';
      result += `<span class="created">Created: ${new Date(note.createdAt).toLocaleString()}</span>`;
      
      if (note.updatedAt) {
        result += `<br><span class="updated">Updated: ${new Date(note.updatedAt).toLocaleString()}</span>`;
      }
      
      result += '</p>';
    }
    
    // Content
    if (isNonEmptyString(note.content)) {
      result += `<div class="content">${formatContent(note.content).replace(/\n/g, '<br>')}</div>`;
    }
    
    // Tags
    const formattedTags = formatTagsList(note.tags);
    if (formattedTags) {
      result += `<p class="tags">Tags: ${formattedTags}</p>`;
    }
    
    // Metadata
    if (includeMetadata) {
      result += '<div class="metadata">';
      result += `<p>ID: ${note.id}</p>`;
      
      if (note.source) {
        result += `<p>Source: ${note.source}</p>`;
      }
      
      // sourceUrl and sourceId are no longer part of the Note type
      // These fields were likely removed in a schema update
      
      result += '</div>';
    }
    
    result += '</div>';
    
    return result;
  }
  
  /**
   * Format note as JSON
   */
  private formatNoteAsJson(
    note: Note,
    options: {
      includeTimestamps: boolean;
      includeMetadata: boolean;
    },
  ): string {
    const { includeTimestamps, includeMetadata } = options;
    
    const result: Record<string, unknown> = {
      id: note.id,
      title: note.title || '',
      content: note.content || '',
      tags: note.tags || [],
    };
    
    if (includeTimestamps) {
      result['createdAt'] = note.createdAt;
      result['updatedAt'] = note.updatedAt;
    }
    
    if (includeMetadata) {
      result['source'] = note.source;
      // sourceUrl and sourceId are no longer part of the Note type
      // Fields were likely removed in a schema update
    }
    
    return JSON.stringify(result, null, 2);
  }
}