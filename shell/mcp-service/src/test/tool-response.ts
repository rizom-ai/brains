import {
  toolConfirmationSchema,
  toolErrorSchema,
  toolSuccessSchema,
  type ToolConfirmation,
  type ToolErrorResponse,
  type ToolSuccessResponse,
} from "../index";
import { z } from "@brains/utils/zod";

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

/** Narrow a tool result to a confirmation request. See {@link expectToolSuccess}. */
export function expectToolConfirmation(response: unknown): ToolConfirmation {
  return toolConfirmationSchema.parse(response);
}

/**
 * The arguments a confirmation carries back, as a record.
 *
 * Tests re-submit these to complete the flow. Parsing is what proves the
 * confirmation carried them through; reading `.args` off an asserted shape
 * would keep passing against a response that was never a confirmation at all.
 */
export function expectConfirmationArgs(
  response: unknown,
): Record<string, unknown> {
  return z
    .record(z.string(), z.unknown())
    .parse(expectToolConfirmation(response).args);
}
