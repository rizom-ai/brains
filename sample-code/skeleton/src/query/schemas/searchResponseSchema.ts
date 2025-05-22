/**
 * Schema for search query responses
 *
 * This schema defines the structure for responses to search queries
 * to ensure consistent and validatable responses from the AI model.
 */
import { z } from "zod";

/**
 * Schema for search responses
 * Validates the structure of responses to search queries
 */
export const searchResponseSchema = z.object({
  /**
   * The main answer text in response to the user's query
   */
  answer: z.string().min(1, "Answer must not be empty"),

  /**
   * Relevance assessment of provided information
   * Explains how relevant the found information was to the query
   */
  relevanceAssessment: z.object({
    /**
     * Overall relevance score from 0-1
     */
    score: z.number().min(0).max(1),

    /**
     * Explanation of why information is or isn't relevant
     */
    explanation: z.string().optional(),

    /**
     * Suggestions for better search terms if results aren't ideal
     */
    suggestedQueries: z.array(z.string()).optional(),
  }),

  /**
   * Summary of sources used
   * Provides a concise summary of which sources contributed to the answer
   */
  sourcesSummary: z.string().optional(),

  /**
   * Recommendations for further exploration
   * Suggests related topics or follow-up questions
   */
  relatedQueries: z.array(z.string()).optional(),

  /**
   * Metadata about the response
   * Contains technical information about the response generation
   */
  metadata: z
    .object({
      /**
       * Whether external sources were consulted
       */
      usedExternalSources: z.boolean().default(false),

      /**
       * Number of relevant entities found
       */
      relevantEntitiesCount: z.number().int().default(0),

      /**
       * Types of entities that contributed to the answer
       */
      entityTypes: z.array(z.string()).default([]),

      /**
       * Confidence in the answer
       */
      confidence: z.number().min(0).max(1).default(0.5),
    })
    .optional(),
});

/**
 * Type definition for search responses
 * Generated from the Zod schema
 */
export type SearchResponse = z.infer<typeof searchResponseSchema>;
