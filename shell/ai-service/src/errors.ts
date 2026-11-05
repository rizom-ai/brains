/** The provider returned output that could not satisfy the requested schema. */
export class AIOutputValidationError extends Error {
  constructor(cause: unknown) {
    super("AI object generation failed: invalid structured output", { cause });
    this.name = "AIOutputValidationError";
  }
}

/** What the user is told when the AI provider declines a turn on content policy. */
export const aiProviderDeclinedMessage =
  "The AI provider declined this request. Try rephrasing your message.";

/** The AI provider declined the request on content policy. */
export class AIProviderDeclinedError extends Error {
  constructor(cause: unknown) {
    super(aiProviderDeclinedMessage, { cause });
    this.name = "AIProviderDeclinedError";
  }
}
