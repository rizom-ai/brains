/**
 * Schema definitions for external source context using Zod
 */
import { z } from 'zod';

/**
 * Schema for external source search results
 */
export const ExternalSourceResultSchema = z.object({
  // Main content from the external source
  content: z.string(),
  
  // Title of the content
  title: z.string(),
  
  // URL to the source content
  url: z.string().url(),
  
  // Name of the specific source
  source: z.string(),
  
  // Type of source (e.g., 'news', 'wikipedia', etc.)
  sourceType: z.string(),
  
  // Timestamp when the content was published/retrieved
  timestamp: z.date(),
  
  // Vector representation of the content (optional for semantic search)
  embedding: z.array(z.number()).optional(),
  
  // Confidence score for relevance to the query
  confidence: z.number().min(0).max(1),
});

/**
 * Schema for external search options
 */
export const ExternalSearchOptionsSchema = z.object({
  // Search query text
  query: z.string().min(1),
  
  // Maximum number of results to return
  limit: z.number().int().positive().optional(),
  
  // Whether to generate and include embeddings with results
  addEmbeddings: z.boolean().optional().default(false),
});

/**
 * Schema for external source metadata
 */
export const ExternalSourceMetadataSchema = z.object({
  // Name of the source
  name: z.string(),
  
  // Type of the source
  type: z.string(),
  
  // Description of the source
  description: z.string().optional(),
  
  // Rate limits for the source API
  rateLimit: z.object({
    // Requests per time period
    requestsPerPeriod: z.number().int().positive().optional(),
    
    // Time period in seconds
    periodInSeconds: z.number().positive().optional(),
    
    // Current count of requests
    currentCount: z.number().int().optional(),
    
    // Reset time for the rate limit
    resetTime: z.date().optional(),
  }).optional(),
  
  // API quota information
  quota: z.object({
    // Maximum requests allowed (e.g., per day/month)
    max: z.number().int().positive().optional(),
    
    // Remaining requests
    remaining: z.number().int().optional(),
    
    // When the quota resets
    resetTime: z.date().optional(),
  }).optional(),
  
  // Current status of the source
  status: z.enum(['available', 'limited', 'unavailable']).optional(),
  
  // Last time the source was checked
  lastChecked: z.date().optional(),
  
  // Additional source-specific properties
  additionalProperties: z.record(z.unknown()).optional(),
});

/**
 * Schema for external source availability check
 */
export const SourceAvailabilitySchema = z.record(z.string(), z.boolean());

/**
 * Schema for external source search request message
 */
export const ExternalSourceSearchRequestSchema = z.object({
  // Search query
  query: z.string().min(1),
  
  // Maximum results to return
  limit: z.number().int().positive().optional().default(5),
  
  // Source type to filter by (optional)
  sourceType: z.string().optional(),
  
  // Whether to include embeddings in results
  includeEmbeddings: z.boolean().optional().default(false),
});

/**
 * Schema for external source search response message
 */
export const ExternalSourceSearchResponseSchema = z.object({
  // Array of search results
  results: z.array(ExternalSourceResultSchema),
  
  // Metadata about the search
  metadata: z.object({
    // Total number of results found (may exceed the limit)
    totalResults: z.number().int().nonnegative().optional(),
    
    // Sources that were searched
    sourcesSearched: z.array(z.string()).optional(),
    
    // Sources that were unavailable during search
    unavailableSources: z.array(z.string()).optional(),
    
    // Time taken to perform search (in ms)
    searchTimeMs: z.number().nonnegative().optional(),
  }).optional(),
});

/**
 * Schema for external source notification when search is completed
 */
export const ExternalSourceSearchNotificationSchema = z.object({
  // Action type
  action: z.literal('search_completed'),
  
  // Query that was searched
  query: z.string(),
  
  // Count of results found
  resultCount: z.number().int().nonnegative(),
  
  // Sources that contained results
  sources: z.array(z.string()),
  
  // Preview of top results (to keep notification size reasonable)
  topResults: z.array(z.object({
    title: z.string(),
    source: z.string(),
    sourceType: z.string(),
    timestamp: z.date(),
  })).max(3),
});

/**
 * Schema for external source notification when availability changes
 */
export const ExternalSourceAvailabilityNotificationSchema = z.object({
  // Action type
  action: z.literal('availability_changed'),
  
  // Map of source names to availability status
  sourceAvailability: z.record(z.string(), z.boolean()),
  
  // When the availability was checked
  timestamp: z.string().datetime(),
});

/**
 * Schema for external source status request message
 */
export const ExternalSourceStatusRequestSchema = z.object({
  // Optional specific source to check
  sourceName: z.string().optional(),
  
  // Whether to include detailed metadata
  includeMetadata: z.boolean().optional().default(false),
});

/**
 * Schema for external source status response message
 */
export const ExternalSourceStatusResponseSchema = z.object({
  // Sources with their availability status
  sources: z.array(z.object({
    name: z.string(),
    isAvailable: z.boolean(),
    metadata: z.record(z.unknown()).optional(),
  })),
});

/**
 * Union schema for all external source notification types
 */
export const ExternalSourceNotificationSchema = z.union([
  ExternalSourceSearchNotificationSchema,
  ExternalSourceAvailabilityNotificationSchema,
]);

/**
 * Derived TypeScript types from the Zod schemas
 */
export type ExternalSourceResult = z.infer<typeof ExternalSourceResultSchema>;
export type ExternalSearchOptions = z.infer<typeof ExternalSearchOptionsSchema>;
export type ExternalSourceMetadata = z.infer<typeof ExternalSourceMetadataSchema>;
export type SourceAvailability = z.infer<typeof SourceAvailabilitySchema>;
export type ExternalSourceSearchRequest = z.infer<typeof ExternalSourceSearchRequestSchema>;
export type ExternalSourceSearchResponse = z.infer<typeof ExternalSourceSearchResponseSchema>;
export type ExternalSourceSearchNotification = z.infer<typeof ExternalSourceSearchNotificationSchema>;
export type ExternalSourceAvailabilityNotification = z.infer<typeof ExternalSourceAvailabilityNotificationSchema>;
export type ExternalSourceStatusRequest = z.infer<typeof ExternalSourceStatusRequestSchema>;
export type ExternalSourceStatusResponse = z.infer<typeof ExternalSourceStatusResponseSchema>;
export type ExternalSourceNotification = z.infer<typeof ExternalSourceNotificationSchema>;