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
      "Build a static site from registered routes. Call this for every user build/rebuild request, including repeated requests like 'build it again' or 'one more build'.",
      buildSiteInputSchema,
      async (input) => {
        requestBuild(input.environment);

        return {
          success: true,
          message: `Site build requested${input.environment ? ` for ${input.environment}` : ""} (debounced)`,
          data: {},
        };
      },
      {
        cli: { name: "build" },
      },
    ),
  ];
}
