import { z } from "@brains/utils";

export type MessageValidationResult<T> =
  | { valid: true; data: T }
  | { valid: false; error: string };

/**
 * Validate a message-like value against a Zod schema.
 */
export function validateMessage<T>(
  message: unknown,
  schema: z.ZodSchema<T>,
): MessageValidationResult<T> {
  try {
    const data = schema.parse(message);
    return { valid: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        valid: false,
        error: error.issues[0]?.message ?? "Validation failed",
      };
    }
    return { valid: false, error: "Unknown validation error" };
  }
}
