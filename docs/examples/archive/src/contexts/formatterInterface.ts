/**
 * Base interface for formatter implementations in the MCP architecture
 * 
 * This interface defines the standard contract for formatter components that
 * transform data from one form to another for display or processing.
 */

/**
 * Common formatting options for all formatter implementations
 */
export interface FormattingOptions {
  [key: string]: unknown;
}

/**
 * Base formatter interface for all context formatter implementations
 * @template T The input type to format
 * @template U The output type after formatting
 */
export interface FormatterInterface<T, U> {
  /**
   * Format data from input type to output type
   * @param data The data to format
   * @param options Optional formatting options
   * @returns The formatted data
   */
  format(data: T, options?: FormattingOptions): U;
}