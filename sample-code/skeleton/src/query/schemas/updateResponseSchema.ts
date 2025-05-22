/**
 * Schema for update operation responses
 *
 * This schema defines the structure for responses to entity update queries
 * to ensure consistent and validatable responses from the AI model.
 */
import { z } from "zod";

/**
 * Schema for update responses
 * Validates the structure of responses to entity update queries
 */
export const updateResponseSchema = z.object({
  /**
   * The main answer text in response to the user's query
   */
  answer: z.string().min(1, "Answer must not be empty"),

  /**
   * Entity update details
   * Contains structured information about the entity updates
   */
  update: z.object({
    /**
     * ID of the entity to update
     */
    entityId: z.string().min(1, "Entity ID is required"),

    /**
     * Type of entity being updated
     */
    entityType: z.string().min(1, "Entity type is required"),

    /**
     * Updated title (if changing)
     */
    title: z.string().optional(),

    /**
     * Updated content (if changing)
     */
    content: z.string().optional(),

    /**
     * Updated tags (if changing)
     */
    tags: z.array(z.string()).optional(),

    /**
     * Properties to update
     */
    properties: z.record(z.unknown()).optional(),
  }),

  /**
   * Summary of changes
   * Provides a concise summary of what was changed and why
   */
  changesSummary: z.string(),

  /**
   * Change rationale
   * Explains the reasoning behind the changes
   */
  rationale: z.string().optional(),

  /**
   * Before/after comparison
   * Highlights differences between original and updated content
   */
  comparison: z
    .object({
      /**
       * Description of what was added
       */
      additions: z.string().optional(),

      /**
       * Description of what was removed
       */
      removals: z.string().optional(),

      /**
       * Description of what was modified
       */
      modifications: z.string().optional(),
    })
    .optional(),

  /**
   * Metadata about the response
   * Contains technical information about the response generation
   */
  metadata: z
    .object({
      /**
       * Whether update was based on other entities
       */
      incorporatedFromOtherEntities: z.boolean().default(false),

      /**
       * IDs of entities that influenced this update
       */
      referenceEntityIds: z.array(z.string()).default([]),

      /**
       * Confidence in the update appropriateness
       */
      confidence: z.number().min(0).max(1).default(0.5),
    })
    .optional(),
});

/**
 * Type definition for update responses
 * Generated from the Zod schema
 */
export type UpdateResponse = z.infer<typeof updateResponseSchema>;
