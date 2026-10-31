import type { Tool } from "@brains/plugins";
import { createTool } from "@brains/plugins";
import { z } from "@brains/utils/zod";

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
      "Build a static site from registered routes. Call this immediately whenever the user asks to build, rebuild, publish, or build the website/site again; every repeated request such as 'build it again' or 'one more build' needs a fresh call. Never say a build was started, queued, or requested unless this turn called this tool.",
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
        sideEffects: "external",
        cli: { name: "build" },
      },
    ),
  ];
}
