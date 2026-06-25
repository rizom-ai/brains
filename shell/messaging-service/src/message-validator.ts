import { z } from "@brains/utils/zod-v4";

export type MessageValidationResult<T> =
  | { valid: true; data: T }
  | { valid: false; error: string };

export interface MessageValidationSchema<T> {
  parse(input: unknown): T;
}

const parseErrorSchema = z.looseObject({
  issues: z
    .array(
      z.looseObject({
        message: z.string(),
      }),
    )
    .optional(),
});

/**
 * Validate a message-like value against a Zod-compatible schema.
 */
export function validateMessage<T>(
  message: unknown,
  schema: MessageValidationSchema<T>,
): MessageValidationResult<T> {
  try {
    const data = schema.parse(message);
    return { valid: true, data };
  } catch (error) {
    const parsedError = parseErrorSchema.safeParse(error);
    if (parsedError.success) {
      return {
        valid: false,
        error: parsedError.data.issues?.[0]?.message ?? "Validation failed",
      };
    }
    return { valid: false, error: "Unknown validation error" };
  }
}
