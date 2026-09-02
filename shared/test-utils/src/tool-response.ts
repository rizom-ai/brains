import {
  toolErrorSchema,
  toolSuccessSchema,
  type ToolErrorResponse,
  type ToolSuccessResponse,
} from "@brains/mcp-service";

/**
 * Narrow a tool result to its success branch.
 *
 * `ToolResponse` is a union, and `(result as { data: unknown }).data` reads
 * the field without ever checking the discriminant: an error response reads
 * back `data: undefined`, and the assertion that follows passes against
 * `undefined` instead of failing on a tool that did not succeed.
 *
 * Parsing through the response's own schema checks the discriminant and the
 * shape, so a tool returning an error — or a success with an unexpected extra
 * field — fails here with what it actually returned.
 */
export function expectToolSuccess(response: unknown): ToolSuccessResponse {
  return toolSuccessSchema.parse(response);
}

/** Narrow a tool result to its error branch. See {@link expectToolSuccess}. */
export function expectToolError(response: unknown): ToolErrorResponse {
  return toolErrorSchema.parse(response);
}
