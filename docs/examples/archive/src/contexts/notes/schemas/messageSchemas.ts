/**
 * Notes Context Message Schemas
 * 
 * This module defines Zod schemas for validating message parameters and payloads
 * specific to the Notes context. These schemas ensure type safety and validation
 * for cross-context communication involving notes.
 */

import { z } from 'zod';

import { DataRequestType, NotificationType } from '@/protocol/messaging/messageTypes';

/**
 * Schema for NOTE_BY_ID request parameters
 * Used when requesting a specific note by its ID
 */
export const NoteByIdParamsSchema = z.object({
  /** Note ID to retrieve */
  id: z.string().min(1, 'Note ID is required'),
});

/**
 * Schema for NOTES_SEARCH request parameters
 * Used when searching for notes by query text
 */
export const NotesSearchParamsSchema = z.object({
  /** Search query text */
  query: z.string().min(1, 'Search query is required'),
  /** Maximum number of notes to return */
  limit: z.number().int().positive().optional(),
  /** Whether to include note content in results */
  includeContent: z.boolean().optional().default(true),
});

/**
 * Schema for NOTES_SEMANTIC_SEARCH request parameters
 * Used when performing semantic search on notes
 */
export const NotesSemanticSearchParamsSchema = z.object({
  /** Text to use for semantic search */
  text: z.string().min(1, 'Search text is required'),
  /** Maximum number of notes to return */
  limit: z.number().int().positive().optional().default(10),
  /** Optional tags to filter notes by */
  tags: z.array(z.string()).optional(),
});

/**
 * Schema for NOTE_CREATED notification payload
 * Used when notifying of a new note creation
 */
export const NoteCreatedPayloadSchema = z.object({
  /** ID of the created note */
  noteId: z.string().min(1, 'Note ID is required'),
  /** Title of the created note */
  title: z.string(),
  /** Tags of the created note */
  tags: z.array(z.string()).optional(),
});

/**
 * Schema for NOTE_UPDATED notification payload
 * Used when notifying of a note update
 */
export const NoteUpdatedPayloadSchema = z.object({
  /** ID of the updated note */
  noteId: z.string().min(1, 'Note ID is required'),
  /** New title of the note (if changed) */
  title: z.string().optional(),
  /** New tags of the note (if changed) */
  tags: z.array(z.string()).optional(),
});

/**
 * Schema for NOTE_DELETED notification payload
 * Used when notifying of a note deletion
 */
export const NoteDeletedPayloadSchema = z.object({
  /** ID of the deleted note */
  noteId: z.string().min(1, 'Note ID is required'),
});

/**
 * Map of message types to their schemas for this context
 * This allows for easy lookup of schemas by message type
 * and helps ensure schema coverage for all message types
 */
export const NoteSchemaMap = {
  // Request parameter schemas
  [DataRequestType.NOTE_BY_ID]: NoteByIdParamsSchema,
  [DataRequestType.NOTES_SEARCH]: NotesSearchParamsSchema,
  [DataRequestType.NOTES_SEMANTIC_SEARCH]: NotesSemanticSearchParamsSchema,
  
  // Notification payload schemas
  [NotificationType.NOTE_CREATED]: NoteCreatedPayloadSchema,
  [NotificationType.NOTE_UPDATED]: NoteUpdatedPayloadSchema,
  [NotificationType.NOTE_DELETED]: NoteDeletedPayloadSchema,
} as const;

// Export derived types for use in type-safe code
export type NoteByIdParams = z.infer<typeof NoteByIdParamsSchema>;
export type NotesSearchParams = z.infer<typeof NotesSearchParamsSchema>;
export type NotesSemanticSearchParams = z.infer<typeof NotesSemanticSearchParamsSchema>;
export type NoteCreatedPayload = z.infer<typeof NoteCreatedPayloadSchema>;
export type NoteUpdatedPayload = z.infer<typeof NoteUpdatedPayloadSchema>;
export type NoteDeletedPayload = z.infer<typeof NoteDeletedPayloadSchema>;