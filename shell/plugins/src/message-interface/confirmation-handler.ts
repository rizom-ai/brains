/**
 * Confirmation Handler - Shared utility for parsing confirmation responses
 *
 * Provides consistent confirmation parsing across all message-based interfaces
 * (CLI, Matrix, etc.) with support for various affirmative and negative responses.
 * The parsing itself lives in `@brains/utils/confirmation-response`; this module
 * re-exports it for the message-interface surface.
 */

export { parseConfirmationResponse } from "@brains/utils/confirmation-response";
