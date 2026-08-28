import { jsonResponse as jsonResponseBase } from "@brains/plugins";

/**
 * Studio API responses are never cached: the editor reads its own writes, and a
 * stale 200 would show an author their pre-save content.
 */
export function jsonResponse(payload: unknown, status = 200): Response {
  return jsonResponseBase(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
