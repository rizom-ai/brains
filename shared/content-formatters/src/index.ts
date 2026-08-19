/**
 * Formatters
 *
 * Schema formatters for the brain system.
 * Provides base classes and common formatters for transforming
 * structured data into human-readable markdown.
 */

// Export types first
export type { SchemaFormatter, ContentFormatter } from "./types";

// Response and content formatters
export {
  CreateEntityResponseFormatter,
  DefaultContentFormatter,
  DefaultQueryResponseFormatter,
  DefaultSchemaFormatter,
  DefaultYamlFormatter,
  ResponseFormatter,
  SimpleTextResponseFormatter,
  StructuredContentFormatter,
  UpdateEntityResponseFormatter,
  getArrayProp,
  getBooleanProp,
  getDefaultContentFormatter,
  getNumberProp,
  getProp,
  getStringProp,
  hasProps,
  type FieldMapping,
  type FormatterConfig,
} from "./formatters";

// Entity field formatters
export {
  SourceListFormatter,
  sourceReferenceSchema,
  type SourceReference,
} from "./entity-field-formatters";

// Tool output formatters
export {
  formatAsEntity,
  formatAsList,
  formatAsSearchResults,
  formatAsTable,
  type EntityFormatOptions,
  type ListFormatOptions,
  type SearchResultItem,
  type SearchResultsFormatOptions,
  type TableColumn,
  type TableFormatOptions,
} from "./tool-formatters";
