import type { z } from "@brains/utils";

/**
 * Safely parse a Response body as JSON. Empty body returns undefined;
 * non-JSON body returns the raw text so error formatters can inspect
 * whatever the server sent without a second read.
 */
export async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export interface ParseJsonResponseOptions {
  label: string;
  formatError?: (response: Response, payload: unknown) => string;
}

/**
 * Read a Response body, parse it against a Zod schema, and throw a
 * labeled error if either the HTTP status or the schema check fails.
 * Callers can supply formatError to customize the error suffix (e.g.
 * to extract provider-specific error fields from the payload).
 */
export async function parseJsonResponse<Schema extends z.ZodTypeAny>(
  response: Response,
  schema: Schema,
  options: ParseJsonResponseOptions,
): Promise<z.infer<Schema>> {
  const payload = await readJsonBody(response);
  const parsed = schema.safeParse(payload);

  if (!response.ok || !parsed.success) {
    const formatter = options.formatError ?? defaultFormatError;
    throw new Error(`${options.label}${formatter(response, payload)}`);
  }

  return parsed.data;
}

function defaultFormatError(response: Response, payload: unknown): string {
  const body =
    payload === undefined
      ? ""
      : `: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`;
  return ` (${response.status} ${response.statusText}${body})`;
}
