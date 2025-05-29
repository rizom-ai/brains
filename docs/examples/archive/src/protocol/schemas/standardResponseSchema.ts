/**
 * Standard response schema for BrainProtocol
 * 
 * This schema defines the structure for model responses when using
 * the standard response format. It includes the answer text and a
 * metadata object with information about the sources used.
 */
import { z } from 'zod';


// Schema for a citation to a note
export const CitationSchema = z.object({
  /** Note ID that was referenced */
  noteId: z.string(),
  /** Title of the referenced note */
  noteTitle: z.string(),
  /** Relevant excerpt from the note */
  excerpt: z.string().optional(),
});

// Schema for an external source
export const ExternalSourceSchema = z.object({
  /** Title of the external source */
  title: z.string(),
  /** Source name (e.g., Wikipedia) */
  source: z.string(),
  /** URL of the source */
  url: z.string(),
  /** Relevant excerpt from the source */
  excerpt: z.string().optional(),
});

// Standard schema for model responses
export const StandardResponseSchema = z.object({
  /** The answer to the user's question */
  answer: z.string(),
  /** Metadata about the response */
  metadata: z.object({
    /** Whether any sources were used */
    hasSources: z.boolean(),
    /** Source types used (e.g., 'notes', 'external', 'profile') */
    sourceTypes: z.array(z.enum(['notes', 'external', 'profile'])).optional(),
    /** Citations to notes used */
    citations: z.array(CitationSchema).optional(),
    /** External sources used */
    externalSources: z.array(ExternalSourceSchema).optional(),
    /** Whether profile information was used */
    usedProfile: z.boolean().optional(),
    /** Brief explanation of sources used */
    sourceExplanation: z.string().optional(),
  }),
});

// Type derived from schema
export type StandardResponse = z.infer<typeof StandardResponseSchema>;

/**
 * Generate a system prompt for the standard schema
 * 
 * @param isProfileQuery Whether this is a profile-related query
 * @param includeExternalSources Whether external sources were included
 * @returns A system prompt instructing the model on how to use the schema
 */
export function generateStandardSystemPrompt(
  isProfileQuery: boolean = false,
  includeExternalSources: boolean = false,
): string {
  let prompt = `
You are a helpful assistant with access to a personal knowledge base.
When answering questions, use the provided context information if relevant.
Structure your response according to the schema provided.

For the 'answer' field:
- Provide a clear, direct, and helpful response to the query
- Use information from the context when relevant
- Be concise but complete

For the 'metadata' object:
- The 'hasSources' field should be true if you referenced any notes, external sources, or profile information
- The 'sourceTypes' field should list the types of sources used (e.g., 'notes', 'external', 'profile')
`;

  // Add note-specific instructions if present in context
  prompt += `
- If you referenced any notes:
  - Include them in the 'citations' array
  - For each citation, include the noteId, noteTitle, and a relevant excerpt
`;

  // Add external source instructions if enabled
  if (includeExternalSources) {
    prompt += `
- If you referenced any external sources:
  - Include them in the 'externalSources' array
  - For each source, include the title, source name, URL, and a relevant excerpt
`;
  }

  // Add profile-specific instructions if relevant
  if (isProfileQuery) {
    prompt += `
- If you referenced profile information:
  - Set 'usedProfile' to true
  - Include 'profile' in the sourceTypes array
`;
  }

  // Add general explanation instructions
  prompt += `
- The 'sourceExplanation' field should briefly explain how you used the sources in your answer

Always prioritize accuracy and relevance in your answer. If the provided context doesn't contain relevant information, be honest about that rather than making up information.
`;

  return prompt.trim();
}