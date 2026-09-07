/** The provider returned output that could not satisfy the requested schema. */
export class AIOutputValidationError extends Error {
  constructor(cause: unknown) {
    super("AI object generation failed: invalid structured output", { cause });
    this.name = "AIOutputValidationError";
  }
}
