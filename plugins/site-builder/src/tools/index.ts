import type { Tool } from "@brains/plugins";
import { createTool } from "@brains/plugins";
import { z } from "@brains/utils";

const buildSiteInputSchema = z.object({
  environment: z
    .enum(["preview", "production"])
    .optional()
    .describe(
      "Build environment (defaults to production, or preview if configured)",
    ),
});

export function createSiteBuilderTools(
  pluginId: string,
  requestBuild: (environment?: "preview" | "production") => void,
): Tool[] {
  return [
    createTool(
      pluginId,
      "build-site",
      "Build a static site from registered routes",
      buildSiteInputSchema,
      async (input) => {
        requestBuild(input.environment);

        return {
          success: true,
          message: `Site build requested${input.environment ? ` for ${input.environment}` : ""} (debounced)`,
          data: {},
        };
      },
    ),
  ];
}
