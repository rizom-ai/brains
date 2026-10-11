import type { Tool } from "@brains/mcp-service";
import { createTool } from "@brains/mcp-service";
import type { AnalyticsReportDefinition } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { SystemServices } from "./types";

/**
 * A report's params as the model sees them: every field optional, defaults
 * left to the report, unknown keys kept. The registry parses with the
 * report's own schema; this copy only shows the fields and must neither drop
 * a param nor fill one in from another report's defaults.
 */
function displayParams(definition: AnalyticsReportDefinition): z.ZodObject {
  const shape = Object.fromEntries(
    Object.entries(definition.params.shape).map(([key, field]) => {
      const inner = field instanceof z.ZodDefault ? field.unwrap() : field;
      const described = field.description
        ? inner.describe(field.description)
        : inner;
      return [key, described.optional()];
    }),
  );
  return z
    .looseObject(shape)
    .describe(`Params for ${definition.type}: ${definition.description}`);
}

function inputSchema(definitions: AnalyticsReportDefinition[]): z.ZodObject<{
  type: z.ZodEnum<Record<string, string>>;
  params: z.ZodOptional<z.ZodType>;
}> {
  const [first, ...rest] = definitions.map((definition) => definition.type);
  if (first === undefined) throw new Error("No analytics reports registered");
  const variants = definitions
    .filter((definition) => Object.keys(definition.params.shape).length > 0)
    .map(displayParams);
  // Last, a catch-all: whatever a variant rejects still reaches the
  // registry, which names the report and the param at fault.
  const params = z.union([...variants, z.looseObject({})]);
  return z.object({
    type: z.enum([first, ...rest]).describe("The report to run"),
    params: params
      .optional()
      .describe("The report's params; each report lists its own"),
  });
}

export function createAnalyticsTools(services: SystemServices): Tool[] {
  const { entityService, analytics } = services;
  const definitions = analytics.getDefinitions();
  const catalogue = definitions
    .map((definition) => `${definition.type} (${definition.description})`)
    .join("; ");

  return [
    createTool(
      "system",
      "analytics",
      `Aggregate metrics and reports over the brain, not its content: for actual content use system_list, system_get or system_search. Reports: ${catalogue}.`,
      inputSchema(definitions),
      async (input, context) => {
        const data = await analytics.run({
          type: input.type,
          params: input.params,
          entityService,
          permission: context.userPermissionLevel ?? "public",
        });
        return { success: true, data };
      },
      { visibility: "public", sideEffects: "none" },
    ),
  ];
}
