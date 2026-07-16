import type { ServicePluginContext, Tool, ToolResponse } from "@brains/plugins";
import { z } from "@brains/utils/zod";

export interface LinkedInImportToolsDeps {
  jobs: ServicePluginContext["jobs"];
}

const importInputParserSchema = z.object({}).strict();

export function createLinkedInImportTools(
  pluginId: string,
  deps: LinkedInImportToolsDeps,
): Tool[] {
  return [
    {
      name: `${pluginId}_import`,
      description:
        "Import the consenting owner's LinkedIn PROFILE snapshot into anchor-profile. Existing owner-authored values are preserved.",
      inputSchema: {},
      visibility: "anchor",
      sideEffects: "writes",
      handler: async (input): Promise<ToolResponse> => {
        const parsed = importInputParserSchema.safeParse(input);
        if (!parsed.success) {
          return {
            success: false,
            error: `Invalid input: ${parsed.error.message}`,
          };
        }

        const jobId = await deps.jobs.enqueue({
          type: "linkedin-import",
          data: {},
        });

        return {
          success: true,
          data: {
            jobId,
            status: "queued",
          },
        };
      },
    },
  ];
}
