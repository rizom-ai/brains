import { z } from "@brains/utils";
import { messageResponseSchema } from "./base-types";

const handlerResponseSchema = z.union([
  z.object({ noop: z.literal(true) }),
  messageResponseSchema,
]);

export type HandlerResponse = z.infer<typeof handlerResponseSchema>;

/**
 * Validate unknown handler output before the bus converts it to an internal
 * response.
 */
export function parseHandlerResponse(result: unknown): HandlerResponse {
  const parsed = handlerResponseSchema.safeParse(result);
  if (!parsed.success) {
    throw new Error("Invalid message response format");
  }

  return parsed.data;
}
