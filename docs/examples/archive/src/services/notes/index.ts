/**
 * Main entry point for note services
 * 
 * PUBLIC API: These exports are intended for use by upstream consumers
 * Based on analysis of imports, these services are the ones directly used
 * by the NoteContext implementation.
 */

export { NoteRepository } from './noteRepository';
export { NoteEmbeddingService } from './noteEmbeddingService';
export { NoteSearchService } from './noteSearchService';