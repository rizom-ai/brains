import { z } from "@brains/utils/zod";
import type { UrlFetcher } from "./url-fetcher";

export interface ExtractContentEvalInput {
  url: string;
}

const extractContentEvalInputSchema: z.ZodType<ExtractContentEvalInput> =
  z.object({ url: z.url() });

export interface ExtractContentEvalFailure {
  success: false;
  error: string;
  errorType?: string | undefined;
}

/**
 * Fetch a URL the way capture does, so an eval case exercises the real
 * fetch path rather than a stand-in.
 *
 * Extraction itself is the caller's job: this returns the fetched content
 * for the eval to hand to the model.
 */
export async function extractContentEval(
  input: unknown,
  fetcher: UrlFetcher,
): Promise<ExtractContentEvalFailure | { success: true; content: string }> {
  const { url } = extractContentEvalInputSchema.parse(input);
  const result = await fetcher.fetch(url);
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? "URL fetch failed",
      ...(result.errorType === undefined
        ? {}
        : { errorType: result.errorType }),
    };
  }
  return { success: true, content: result.content ?? "" };
}
