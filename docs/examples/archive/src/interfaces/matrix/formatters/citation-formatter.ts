/**
 * Enhanced citation formatter for Matrix messages
 * 
 * Provides rich, visually distinct citation formats for different source types
 */


import type { Citation, CitationSourceType } from './types';

/**
 * Matrix Citation Formatter
 * 
 * Formats citations in a visually distinct way for Matrix messages
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */
export class MatrixCitationFormatter {
  /**
   * Singleton instance of MatrixCitationFormatter
   * This property should be accessed only by getInstance(), resetInstance(), and createFresh()
   */
  private static instance: MatrixCitationFormatter | null = null;
  
  /**
   * Get the singleton instance of the formatter
   * 
   * Part of the Component Interface Standardization pattern.
   * 
   * @returns The shared MatrixCitationFormatter instance
   */
  public static getInstance(): MatrixCitationFormatter {
    if (!MatrixCitationFormatter.instance) {
      MatrixCitationFormatter.instance = new MatrixCitationFormatter();
    }
    return MatrixCitationFormatter.instance;
  }
  
  /**
   * Reset the singleton instance
   * 
   * Part of the Component Interface Standardization pattern.
   * Primarily used for testing to ensure a clean state.
   */
  public static resetInstance(): void {
    MatrixCitationFormatter.instance = null;
  }
  
  /**
   * Create a fresh formatter instance
   * 
   * Part of the Component Interface Standardization pattern.
   * Creates a new instance without affecting the singleton instance.
   * Primarily used for testing.
   * 
   * @returns A new MatrixCitationFormatter instance
   */
  public static createFresh(): MatrixCitationFormatter {
    return new MatrixCitationFormatter();
  }

  /**
   * Format a single citation
   * 
   * @param citation Citation data
   * @returns Formatted HTML
   */
  formatCitation(citation: Citation): string {
    // Get icon based on source type
    const icon = this.getSourceIcon(citation.type);
    
    // Create base citation structure
    let citationHtml = `
      <div class="citation" style="margin: 12px 0; padding: 8px 12px; border-left: 4px solid #2196F3; background-color: rgba(33, 150, 243, 0.05);">
        <div class="citation-header" style="display: flex; align-items: center; margin-bottom: 4px;">
          <span style="margin-right: 6px;">${icon}</span>
          <strong>${citation.title || citation.source}</strong>`;
    
    // Add date if available
    if (citation.date) {
      citationHtml += `<span style="margin-left: auto; color: #757575; font-size: 0.9em;">${citation.date}</span>`;
    }
    
    citationHtml += '</div>';
    
    // Add content
    citationHtml += `<div class="citation-content" style="margin: 4px 0;">${citation.content}</div>`;
    
    // Add source info
    citationHtml += `<div class="citation-source" style="font-style: italic; color: #757575; font-size: 0.9em;">Source: ${citation.source}`;
    
    // Add ID if available
    if (citation.id) {
      citationHtml += ` <code style="background-color: rgba(0,0,0,0.05); padding: 2px 4px; border-radius: 3px;">${citation.id}</code>`;
    }
    
    citationHtml += '</div>';
    
    // Add URL link if available
    if (citation.url) {
      citationHtml += `<div class="citation-link" style="margin-top: 4px;">
        <a href="${citation.url}" target="_blank" style="color: #2196F3;">View source</a>
      </div>`;
    }
    
    citationHtml += '</div>';
    
    return citationHtml;
  }

  /**
   * Format a list of citations
   * 
   * @param citations List of citations
   * @param title Optional section title
   * @returns Formatted HTML
   */
  formatCitationList(citations: Citation[], title = 'Sources'): string {
    if (citations.length === 0) {
      return '';
    }
    
    let html = `<div class="citations-section">
      <h3>${title}</h3>`;
    
    // Add each citation
    citations.forEach(citation => {
      html += this.formatCitation(citation);
    });
    
    html += '</div>';
    
    return html;
  }

  /**
   * Create a citation from a note
   * 
   * @param note Note object
   * @param excerpt Optional excerpt text
   * @returns Citation object
   */
  createNoteBasedCitation(note: { id: string; title: string; content: string; createdAt?: string | Date }, excerpt?: string): Citation {
    // Extract date
    const dateString = note.createdAt 
      ? new Date(note.createdAt).toLocaleDateString()
      : undefined;

    return {
      source: 'Note',
      title: note.title,
      content: excerpt || this.getExcerpt(note.content, 200),
      type: 'note',
      id: note.id,
      date: dateString,
    };
  }

  /**
   * Get an appropriate icon for the source type
   * 
   * @param type Source type
   * @returns HTML icon
   */
  private getSourceIcon(type: CitationSourceType): string {
    switch (type) {
    case 'note':
      return '📝';
    case 'webpage':
      return '🌐';
    case 'article':
      return '📰';
    case 'conversation':
      return '💬';
    default:
      return '📄';
    }
  }

  /**
   * Extract a snippet of text from longer content
   * 
   * @param content The full content
   * @param maxLength Maximum length to extract
   * @returns Formatted excerpt
   */
  private getExcerpt(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }
    
    // Trim to max length
    const excerpt = content.substring(0, maxLength);
    
    // Try to find a sentence or paragraph break
    const breakPoints = ['. ', '? ', '! ', '\n\n'];
    
    // Start from 3/4 through the excerpt and look for a natural break point
    const breakIndex = Math.floor(maxLength * 0.75);
    
    for (let i = breakIndex; i < excerpt.length; i++) {
      for (const breakPoint of breakPoints) {
        if (excerpt.substring(i - breakPoint.length + 1, i + 1) === breakPoint) {
          return excerpt.substring(0, i + 1);
        }
      }
    }
    
    // If no good break point, use the whole excerpt + ellipsis
    return excerpt + '...';
  }
}

