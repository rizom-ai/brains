import type { ContentTemplate, ContentGenerateOptions } from "@brains/types";

/**
 * Helper to generate content using a template with additional context
 */
export async function generateWithTemplate<T>(
  generateContent: <T>(options: ContentGenerateOptions<T>) => Promise<T>,
  template: ContentTemplate<T>,
  contentType: string,
  additionalContext?: {
    prompt?: string;
    data?: Record<string, unknown>;
    examples?: T[];
    style?: string;
  },
  persistenceOptions?: {
    save?: boolean;
  },
): Promise<T> {
  // Combine template prompt with additional prompt if provided
  let finalPrompt = template.basePrompt;
  if (additionalContext?.prompt) {
    finalPrompt = `${template.basePrompt}\n\nAdditional instructions: ${additionalContext.prompt}`;
  }

  const options: ContentGenerateOptions<T> = {
    schema: template.schema,
    prompt: finalPrompt,
    contentType: contentType,
  };

  // Add context if provided
  if (additionalContext) {
    const context: ContentGenerateOptions<T>["context"] = {};

    if (additionalContext.data !== undefined) {
      context.data = additionalContext.data;
    }
    if (additionalContext.examples !== undefined) {
      context.examples = additionalContext.examples;
    }
    if (additionalContext.style !== undefined) {
      context.style = additionalContext.style;
    }

    // Only add context to options if it has properties
    if (Object.keys(context).length > 0) {
      options.context = context;
    }
  }

  // Add persistence options if provided
  if (persistenceOptions?.save !== undefined) {
    options.save = persistenceOptions.save;
  }

  return generateContent(options);
}
