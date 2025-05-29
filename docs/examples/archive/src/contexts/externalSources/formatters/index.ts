/**
 * External Sources Formatters
 * 
 * This barrel file exports public formatter components for the ExternalSourceContext
 * without leaking implementation details
 */

import { ExternalSourceFormatter, type ExternalSourceFormattingOptions } from './externalSourceFormatter';

// Only export the public API
export { ExternalSourceFormatter };
export type { ExternalSourceFormattingOptions };