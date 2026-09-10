import { defineJob, z } from "@brains/sdk/services";
import { siteContentEntity } from "./entity";
import type { ServiceJobDefinition } from "@brains/sdk/services";

export const fillSectionInputSchema: z.ZodObject<{
  routeId: z.ZodString;
  sectionId: z.ZodString;
  templateName: z.ZodString;
  routeTitle: z.ZodOptional<z.ZodString>;
  routeDescription: z.ZodOptional<z.ZodString>;
  prompt: z.ZodOptional<z.ZodString>;
}> = z.object({
  routeId: z.string().min(1),
  sectionId: z.string().min(1),
  /** Scoped, as a route names it. */
  templateName: z.string().min(1),
  routeTitle: z.string().optional(),
  routeDescription: z.string().optional(),
  /** What the route said this section should say, when it said anything. */
  prompt: z.string().optional(),
});

export type FillSectionInput = z.output<typeof fillSectionInputSchema>;

const fillSectionOutputSchema: z.ZodObject<{
  entityId: z.ZodString;
  written: z.ZodBoolean;
  reason: z.ZodOptional<z.ZodString>;
}> = z.object({
  entityId: z.string(),
  written: z.boolean(),
  /** Why nothing was written, for a section the runtime cannot generate. */
  reason: z.string().optional(),
});

/**
 * Fill in one page section from the template its route names.
 *
 * The template is the brain's, not this package's: the route says which
 * one, the registry holds its prompt and its schema, and this job stores
 * what came back as the section's own record.
 */
export const fillSectionJob: ServiceJobDefinition<
  "fill-section",
  typeof fillSectionInputSchema,
  typeof fillSectionOutputSchema
> = defineJob({
  name: "fill-section",
  input: fillSectionInputSchema,
  output: fillSectionOutputSchema,
  // Two requests to fill the same section produce the same section; the one
  // already waiting will read whatever the route says when it runs.
  oncePending: (input) => `fill-section:${input.routeId}:${input.sectionId}`,
});

/** The section's own record, named for the route and section it fills. */
export function sectionEntityId(routeId: string, sectionId: string): string {
  return `${routeId}:${sectionId}`;
}

export function handleFillSection(): ReturnType<typeof fillSectionJob.handle> {
  return fillSectionJob.handle(async ({ input, templates, entities }) => {
    const entityId = sectionEntityId(input.routeId, input.sectionId);
    const capabilities = templates.capabilities(input.templateName);
    if (!capabilities?.canGenerate) {
      return {
        entityId,
        written: false,
        reason: `Template "${input.templateName}" cannot generate content`,
      };
    }

    const value = await templates.generate(input.templateName, {
      ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
      data: {
        routeId: input.routeId,
        sectionId: input.sectionId,
        routeTitle: input.routeTitle,
        routeDescription: input.routeDescription,
      },
    });

    await entities.saveProcessed(siteContentEntity, {
      id: entityId,
      content: templates.format(input.templateName, value),
      metadata: { routeId: input.routeId, sectionId: input.sectionId },
    });

    return { entityId, written: true };
  });
}
