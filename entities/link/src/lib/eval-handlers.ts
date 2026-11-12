import type { EntityEvalDeclaration } from "@brains/sdk/entities";
import { z } from "@brains/utils/zod";
import { linkFetcher } from "../jobs/capture";
import { linkExtractionSchema } from "../templates/extraction-template";

const extractContentEvalInputSchema = z.object({ url: z.url() });

/** The link's eval: a page fetched and its content extracted, as captures do. */
export function linkEvals(
  jinaApiKey: string | undefined,
): EntityEvalDeclaration {
  const fetcher = linkFetcher(jinaApiKey);
  return {
    extractContent: async (input, { ai }): Promise<unknown> => {
      const { url } = extractContentEvalInputSchema.parse(input);
      const fetched = await fetcher.fetch(url);
      if (!fetched.success) {
        return {
          success: false,
          error: fetched.error,
          errorType: fetched.errorType,
        };
      }
      return ai.generate(
        {
          template: "extraction",
          prompt: `Extract structured information from this webpage content:\n\n${fetched.content}`,
          data: { url, hasContent: true },
          representedIdentity: "none",
        },
        linkExtractionSchema,
      );
    },
  };
}
