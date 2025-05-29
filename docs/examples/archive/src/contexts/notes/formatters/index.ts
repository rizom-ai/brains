/**
 * Note Formatters
 * 
 * This barrel file exports public formatter components for the NoteContext
 * without leaking implementation details
 */

import { NoteFormatter, type NoteFormattingOptions } from './noteFormatter';

// Only export the public API
export { NoteFormatter };
export type { NoteFormattingOptions };