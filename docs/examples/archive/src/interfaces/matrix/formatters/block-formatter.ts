/**
 * Block formatter for Matrix UI
 * 
 * Implements the MSC2398 proposal (Matrix Slack-like blocks)
 * with fallback to standard HTML/Markdown for clients without block support
 * 
 * Reference: https://github.com/matrix-org/matrix-spec-proposals/pull/2398
 */

import logger from '@/utils/logger';

import { MatrixMarkdownFormatter } from './markdown-formatter';

// Block element types
export enum BlockType {
  SECTION = 'section',
  ACTIONS = 'actions',
  CONTEXT = 'context',
  DIVIDER = 'divider',
  IMAGE = 'image',
  HEADER = 'header',
}

// Block element interfaces
export interface TextObject {
  type: 'plain_text' | 'mrkdwn';
  text: string;
}

export interface Block {
  type: BlockType;
  id?: string;
  elements?: BlockElement[];
  text?: TextObject;
  title?: TextObject;
  alt_text?: string;
  url?: string;
  image_url?: string;
}

// Block element types
export interface BlockElement {
  type: string;
  text?: string;
  url?: string;
  value?: string | number | boolean;
  [key: string]: unknown; // Required for dynamic property access
}

// Block builder options
export interface BlockBuilderOptions {
  clientSupportsBlocks?: boolean;
  fallbackToHtml?: boolean;
}

/**
 * Matrix Block Builder
 * 
 * Builds Matrix UI blocks with fallback for clients without block support
 */
export class MatrixBlockBuilder {
  private blocks: Block[] = [];
  private options: BlockBuilderOptions;
  private markdown = MatrixMarkdownFormatter.getInstance();

  constructor(options: BlockBuilderOptions = {}) {
    this.options = {
      clientSupportsBlocks: false, // Default to false until we detect support
      fallbackToHtml: true,
      ...options,
    };
  }

  /**
   * Add a header block
   * 
   * @param text Header text
   * @returns this (for chaining)
   */
  addHeader(text: string): this {
    this.blocks.push({
      type: BlockType.HEADER,
      text: { type: 'plain_text', text },
    });
    return this;
  }

  /**
   * Add a section block with markdown text
   * 
   * @param text Section text (supports markdown)
   * @returns this (for chaining)
   */
  addSection(text: string): this {
    this.blocks.push({
      type: BlockType.SECTION,
      text: { type: 'mrkdwn', text },
    });
    return this;
  }

  /**
   * Add a divider block
   * 
   * @returns this (for chaining)
   */
  addDivider(): this {
    this.blocks.push({
      type: BlockType.DIVIDER,
    });
    return this;
  }

  /**
   * Add an image block
   * 
   * @param url Image URL
   * @param altText Alt text
   * @param title Optional title
   * @returns this (for chaining)
   */
  addImage(url: string, altText: string, title?: string): this {
    const block: Block = {
      type: BlockType.IMAGE,
      alt_text: altText,
      image_url: url,
    };
    
    if (title) {
      block.title = { type: 'plain_text', text: title };
    }
    
    this.blocks.push(block);
    return this;
  }

  /**
   * Add a context block (for smaller text elements)
   * 
   * @param elements Text elements
   * @returns this (for chaining)
   */
  addContext(elements: string[]): this {
    this.blocks.push({
      type: BlockType.CONTEXT,
      elements: elements.map(text => ({ type: 'mrkdwn', text })),
    });
    return this;
  }

  /**
   * Build the final block structure
   * 
   * @returns Block structure or HTML fallback
   */
  build(): string | Record<string, unknown> {
    if (this.options.clientSupportsBlocks) {
      logger.debug('Building blocks for client that supports MSC2398');
      return {
        msgtype: 'm.message',
        body: this.generatePlainTextFallback(),
        blocks: this.blocks,
      };
    } else if (this.options.fallbackToHtml) {
      logger.debug('Building HTML fallback for client without block support');
      return this.generateHtmlFallback();
    } else {
      logger.debug('Building plain text fallback');
      return this.generatePlainTextFallback();
    }
  }

  /**
   * Generate HTML fallback for clients without block support
   * 
   * @returns HTML representation of blocks
   */
  private generateHtmlFallback(): string {
    let html = '<div class="blocks">';
    
    for (const block of this.blocks) {
      switch (block.type) {
      case BlockType.HEADER:
        html += `<h3>${block.text && 'text' in block.text ? block.text['text'] : ''}</h3>`;
        break;
          
      case BlockType.SECTION:
        html += this.markdown.format(block.text && 'text' in block.text ? block.text['text'] : '');
        break;
          
      case BlockType.DIVIDER:
        html += '<hr>';
        break;
          
      case BlockType.IMAGE:
        html += '<div class="image-block">';
        if (block.title) {
          html += `<div class="image-title">${'text' in block.title ? block.title['text'] : ''}</div>`;
        }
        html += `<img src="${block.image_url || ''}" alt="${block.alt_text || ''}" style="max-width: 100%;">`;
        html += '</div>';
        break;
          
      case BlockType.CONTEXT:
        html += '<div class="context-block" style="font-size: 0.9em; color: #666;">';
        if (block.elements) {
          block.elements.forEach(element => {
            if (element.type === 'mrkdwn' && 'text' in element) {
              html += `<div>${this.markdown.format(element['text'] as string)}</div>`;
            } else if ('text' in element) {
              html += `<div>${element['text']}</div>`;
            }
          });
        }
        html += '</div>';
        break;
      }
    }
    
    html += '</div>';
    return html;
  }

  /**
   * Generate plain text fallback for clients without block or HTML support
   * 
   * @returns Plain text representation of blocks
   */
  private generatePlainTextFallback(): string {
    let text = '';
    
    for (const block of this.blocks) {
      switch (block.type) {
      case BlockType.HEADER:
        text += `### ${block.text && 'text' in block.text ? block.text['text'] : ''}\n\n`;
        break;
          
      case BlockType.SECTION:
        text += `${block.text && 'text' in block.text ? block.text['text'] : ''}\n\n`;
        break;
          
      case BlockType.DIVIDER:
        text += '---\n\n';
        break;
          
      case BlockType.IMAGE:
        if (block.title && 'text' in block.title) {
          text += `${block.title['text']}\n`;
        }
        text += `[Image: ${block.alt_text || 'Image'}]\n\n`;
        break;
          
      case BlockType.CONTEXT:
        if (block.elements) {
          block.elements.forEach(element => {
            if ('text' in element) {
              text += `${element['text']}\n`;
            }
          });
          text += '\n';
        }
        break;
      }
    }
    
    return text;
  }

  /**
   * Check if client supports blocks
   * 
   * Future implementation will use feature detection
   * 
   * @returns true if blocks are supported
   */
  static doesClientSupportBlocks(): boolean {
    // For now, return false until MSC2398 is implemented in clients
    return false;
  }
}

// Singleton instance
let builder: MatrixBlockBuilder | null = null;

/**
 * Get the singleton instance of the block builder
 */
export function getBlockBuilder(options?: BlockBuilderOptions): MatrixBlockBuilder {
  if (!builder) {
    const supportsBlocks = MatrixBlockBuilder.doesClientSupportBlocks();
    builder = new MatrixBlockBuilder({
      clientSupportsBlocks: supportsBlocks,
      fallbackToHtml: true,
      ...options,
    });
  }
  return builder;
}