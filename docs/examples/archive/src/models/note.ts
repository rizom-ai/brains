import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import { noteChunks, notes } from '../db/schema';

// Use drizzle-zod to automatically generate schemas from the database schema
export const insertNoteSchema = createInsertSchema(notes, {
  // Only override what's necessary - mainly JSON field types
  tags: z.array(z.string()),
  embedding: z.array(z.number()).min(1, 'Embedding array cannot be empty'),
  conversationMetadata: z.object({
    conversationId: z.string(),
    timestamp: z.date(),
    userName: z.string().optional(),
    promptSegment: z.string().optional(),
  }).nullable().optional(),
});

export const selectNoteSchema = createSelectSchema(notes, {
  // Override JSON field types for proper parsing
  tags: z.array(z.string()),
  embedding: z.array(z.number()),
  conversationMetadata: z.object({
    conversationId: z.string(),
    timestamp: z.date(),
    userName: z.string().optional(),
    promptSegment: z.string().optional(),
  }).nullable(),
});

// Type definitions based on the schemas
export type Note = z.infer<typeof selectNoteSchema>;
export type NewNote = z.infer<typeof insertNoteSchema>;

// Validation function for note creation
export function validateNote(data: unknown): NewNote {
  return insertNoteSchema.parse(data);
}

// Create update schema from insert schema, making all fields optional
export const updateNoteSchema = insertNoteSchema.partial().extend({
  // If updating embedding, it must be valid (not empty)
  embedding: z.array(z.number()).min(1, 'Embedding array cannot be empty').optional(),
});

export type UpdateNote = z.infer<typeof updateNoteSchema>;

// Enhanced validation schema for searching notes
export const noteSearchSchema = z.object({
  query: z.string().optional(),
  tags: z.array(z.string()).optional(),
  source: z.enum(['import', 'conversation', 'user-created', 'landing-page', 'profile']).optional(),
  conversationId: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
  orderBy: z.enum(['createdAt', 'updatedAt', 'relevance']).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type NoteSearchParams = z.infer<typeof noteSearchSchema>;

// Note chunk schemas
export const insertNoteChunkSchema = createInsertSchema(noteChunks, {
  // Override JSON field types
  embedding: z.array(z.number()).min(1, 'Embedding array cannot be empty'),
});

export const selectNoteChunkSchema = createSelectSchema(noteChunks, {
  // Override JSON field types
  embedding: z.array(z.number()),
});

// Type definitions for note chunks
export type NoteChunk = z.infer<typeof selectNoteChunkSchema>;
export type NewNoteChunk = z.infer<typeof insertNoteChunkSchema>;
