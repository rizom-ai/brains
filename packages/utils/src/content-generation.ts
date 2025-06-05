import type { ContentTemplate, ContentGenerateOptions } from "@brains/types";

/**
 * Helper to generate content using a template with additional context
 */
export async function generateWithTemplate<T>(
  generateContent: <T>(options: ContentGenerateOptions<T>) => Promise<T>,
  template: ContentTemplate<T>,
  additionalContext?: {
    prompt?: string;
    data?: Record<string, unknown>;
    examples?: T[];
    style?: string;
  }
): Promise<T> {
  // Combine template prompt with additional prompt if provided
  let finalPrompt = template.basePrompt;
  if (additionalContext?.prompt) {
    finalPrompt = `${template.basePrompt}\n\nAdditional instructions: ${additionalContext.prompt}`;
  }

  const options: ContentGenerateOptions<T> = {
    schema: template.schema,
    prompt: finalPrompt,
  };

  // Add context if provided
  if (additionalContext) {
    options.context = {};
    
    if (additionalContext.data !== undefined) {
      options.context.data = additionalContext.data;
    }
    if (additionalContext.examples !== undefined) {
      options.context.examples = additionalContext.examples;
    }
    if (additionalContext.style !== undefined) {
      options.context.style = additionalContext.style;
    }
  }

  return generateContent(options);
}