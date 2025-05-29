/**
 * Matrix formatters index
 * 
 * Exports public matrix formatters for easy importing
 * without leaking implementation details
 */

// Import specific exports from each formatter
import {
  type Block,
  type BlockBuilderOptions,
  type BlockElement, 
  type BlockType,
  getBlockBuilder,
  MatrixBlockBuilder,
  type TextObject,
} from './block-formatter';
import {
  MatrixCitationFormatter,
} from './citation-formatter';
import { 
  type MarkdownFormatterOptions,
  MatrixMarkdownFormatter, 
} from './markdown-formatter';
import {
  MatrixResponseFormatter,
  type ResponseFormatterOptions,
  type ResponseType,
} from './response-formatter';
import type { BlockContent } from './types';

// Only export the public API - value exports
export {
  // Markdown formatter
  MatrixMarkdownFormatter,
  
  // Citation formatter
  MatrixCitationFormatter,
  
  // Block builder
  getBlockBuilder,
  MatrixBlockBuilder,
  
  // Response formatter
  MatrixResponseFormatter,
};

// Type exports
export type {
  // Markdown formatter
  MarkdownFormatterOptions,
  
  // Block builder
  BlockType,
  TextObject,
  Block,
  BlockElement,
  BlockBuilderOptions,
  BlockContent,
  
  // Response formatter
  ResponseType,
  ResponseFormatterOptions,
};