/**
 * Schema for create operation responses
 *
 * This schema defines the structure for responses to entity creation queries
 * to ensure consistent and validatable responses from the AI model.
 */
import { z } from "zod";

/**
 * Schema for creation responses
 * Validates the structure of responses to entity creation queries
 */
export const createResponseSchema = z.object({
  /**
   * The main answer text in response to the user's query
   */
  answer: z.string().min(1, "Answer must not be empty"),

  /**
   * Entity creation details
   * Contains structured information about the entity to be created
   */
  entity: z.object({
    /**
     * Type of entity to create (note, profile, etc.)
     */
    type: z.string().min(1, "Entity type is required"),

    /**
     * Title for the entity
     */
    title: z.string().min(1, "Title is required"),

    /**
     * Content for the entity
     */
    content: z.string().min(1, "Content is required"),

    /**
     * Tags for the entity
     */
    tags: z.array(z.string()).default([]),

    /**
     * Custom properties specific to the entity type
     */
    properties: z.record(z.unknown()).optional(),
  }),

  /**
   * Explanation of creation process
   * Provides context on how the entity was structured
   */
  explanation: z.string().optional(),

  /**
   * Recommendations for next steps
   * Suggests actions to take after entity creation
   */
  nextSteps: z.array(z.string()).optional(),

  /**
   * Metadata about the response
   * Contains technical information about the response generation
   */
  metadata: z
    .object({
      /**
       * Whether entity was based on existing entities
       */
      basedOnExistingEntities: z.boolean().default(false),

      /**
       * IDs of entities that influenced this creation
       */
      relatedEntityIds: z.array(z.string()).default([]),

      /**
       * Confidence in the entity structure
       */
      confidence: z.number().min(0).max(1).default(0.5),
    })
    .optional(),
});

/**
 * Type definition for creation responses
 * Generated from the Zod schema
 */
export type CreateResponse = z.infer<typeof createResponseSchema>;
