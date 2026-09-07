import {
  defineServicePlugin,
  defineTool,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import { siteContentEntity } from "./entity";
import {
  fillSectionJob,
  handleFillSection,
  sectionEntityId,
} from "./fill-section";
import { GenerateOptionsSchema } from "./schemas/generate-options";
import { siteContentPluginConfigSchema } from "./schemas/config";
import { sectionTemplates, sectionViews } from "./sections";

/** What a route tells this package about the sections it carries. */
const routeSectionSchema = z.looseObject({
  id: z.string(),
  template: z.string().optional(),
  content: z.unknown().optional(),
});

const routeSchema = z.looseObject({
  id: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  sections: z.array(routeSectionSchema),
});

/** The site builder's answer, which is the list of routes it holds. */
const routesAnswerSchema = z.object({
  success: z.literal(true),
  data: z.array(routeSchema),
});

type SiteRoute = z.output<typeof routeSchema>;

const generateOutputSchema = z.object({
  queued: z.array(
    z.object({ jobId: z.string(), routeId: z.string(), sectionId: z.string() }),
  ),
  totalSections: z.number().int().nonnegative(),
  queuedSections: z.number().int().nonnegative(),
  dryRun: z.boolean(),
});

/**
 * The brain's page sections: what a site says, as records it can regenerate.
 *
 * The sections themselves come from the brain's own configuration — an app
 * describes its landing page and this turns each section into a template
 * the site builder renders and the runtime can fill in. What is generated
 * is stored as this package's own entity, one per route section.
 */
export function siteContentService(): ServicePackageDefinition<
  typeof siteContentPluginConfigSchema
> {
  return defineServicePlugin(
    {
      // Named for what it does rather than for the type it owns: a service and
      // an entity type may not share a name, and the records are the content.
      id: "sections",
      config: siteContentPluginConfigSchema,
      entities: [siteContentEntity],
    },
    {
      // The sections a brain configured, named from the namespace its author
      // chose because that is how a route names them.
      templates: ({ config }) => sectionTemplates(config.definitions),
      views: ({ config }) => sectionViews(config.definitions),

      jobs: () => [handleFillSection()],

      tools: ({ jobs, templates }) => [
        defineTool({
          name: "generate",
          description:
            "Generate content for all routes, a specific route, or a specific section",
          input: GenerateOptionsSchema,
          output: generateOutputSchema,
          permission: "admin",
          sideEffects: "writes",
          execute: async ({ input, entities, messaging, logger }) => {
            if (input.sectionId && !input.routeId) {
              throw new Error("sectionId requires routeId to be specified");
            }

            const answer = routesAnswerSchema.safeParse(
              await messaging.request({
                type: SITE_BUILDER_CHANNELS.routesList,
                payload: {},
              }),
            );
            if (!answer.success) {
              throw new Error(
                "The site builder did not answer with its routes; is it running?",
              );
            }

            const routes = input.routeId
              ? answer.data.data.filter((route) => route.id === input.routeId)
              : answer.data.data;
            if (input.routeId && routes.length === 0) {
              throw new Error(`Route not found: ${input.routeId}`);
            }

            const fillable: Array<{
              route: SiteRoute;
              sectionId: string;
              template: string;
            }> = [];
            for (const route of routes) {
              for (const section of route.sections) {
                if (input.sectionId && section.id !== input.sectionId) continue;
                if (section.content) continue;
                if (!section.template) continue;
                if (!templates.capabilities(section.template)?.canGenerate) {
                  logger.debug("Section cannot be generated, skipping", {
                    routeId: route.id,
                    sectionId: section.id,
                    template: section.template,
                  });
                  continue;
                }
                if (!input.force && !input.dryRun) {
                  const existing = await entities.getEntity({
                    entityType: "site-content",
                    id: sectionEntityId(route.id, section.id),
                  });
                  if (existing) continue;
                }
                fillable.push({
                  route,
                  sectionId: section.id,
                  template: section.template,
                });
              }
            }

            if (input.dryRun) {
              return {
                queued: [],
                totalSections: fillable.length,
                queuedSections: fillable.length,
                dryRun: true,
              };
            }

            const queued = await Promise.all(
              fillable.map(async ({ route, sectionId, template }) => {
                const job = await jobs.enqueue(fillSectionJob, {
                  routeId: route.id,
                  sectionId,
                  templateName: template,
                  ...(route.title !== undefined
                    ? { routeTitle: route.title }
                    : {}),
                  ...(route.description !== undefined
                    ? { routeDescription: route.description }
                    : {}),
                });
                return { jobId: job.id, routeId: route.id, sectionId };
              }),
            );

            return {
              queued,
              totalSections: fillable.length,
              queuedSections: queued.length,
              dryRun: false,
            };
          },
        }),
      ],
    },
  );
}
