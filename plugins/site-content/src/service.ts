import {
  defineServicePlugin,
  defineTool,
  SdkError,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import { siteContentEntity } from "./entity";
import {
  GenerateOptionsSchema,
  GenerateResultJobSchema,
} from "./schemas/generate-options";
import { siteContentPluginConfigSchema } from "./schemas/config";
import { sectionTemplates } from "./sections";

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
const routesAnswerSchema = z.object({
  success: z.literal(true),
  data: z.array(routeSchema),
});
const generateOutputSchema = z.object({
  message: z.string(),
  jobs: z.array(GenerateResultJobSchema),
  totalSections: z.number().int().nonnegative(),
  jobsQueued: z.number().int().nonnegative(),
  batchId: z.string().optional(),
});

/** Site discovery declares destinations; the shared generation runtime owns admission and writes. */
export function siteContentService(): ServicePackageDefinition<
  typeof siteContentPluginConfigSchema
> {
  return defineServicePlugin(
    {
      id: "sections",
      config: siteContentPluginConfigSchema,
      entities: [siteContentEntity],
    },
    {
      templates: ({ config }) => sectionTemplates(config.definitions),
      tools: ({ content, templates }) => [
        defineTool({
          name: "generate",
          description:
            "Generate content for all routes, a specific route, or a specific section",
          input: GenerateOptionsSchema,
          output: generateOutputSchema,
          permission: "admin",
          sideEffects: "writes",
          execute: async ({ input, messaging, signal }) => {
            signal.throwIfAborted();
            if (input.sectionId && !input.routeId) {
              throw new SdkError("invalid_input", {
                publicMessage: "sectionId requires routeId to be specified",
              });
            }
            const answer = routesAnswerSchema.safeParse(
              await messaging.request({
                type: SITE_BUILDER_CHANNELS.routesList,
                payload: {},
              }),
            );
            signal.throwIfAborted();
            if (!answer.success) {
              throw new SdkError("no_handler", {
                publicMessage:
                  "The site builder did not answer with its routes; is it running?",
              });
            }
            const routes = input.routeId
              ? answer.data.data.filter((route) => route.id === input.routeId)
              : answer.data.data;
            if (input.routeId && routes.length === 0) {
              throw new SdkError("not_found", {
                publicMessage: `Route not found: ${input.routeId}`,
              });
            }
            const targets = routes.flatMap((route) =>
              route.sections.flatMap((section) => {
                if (input.sectionId && section.id !== input.sectionId)
                  return [];
                if (
                  section.content ||
                  !section.template ||
                  !templates.capabilities(section.template)?.canGenerate
                )
                  return [];
                return [
                  content.targetFromRegisteredTemplate({
                    template: section.template,
                    context: {
                      data: {
                        routeId: route.id,
                        sectionId: section.id,
                        ...(route.title !== undefined
                          ? { routeTitle: route.title }
                          : {}),
                        ...(route.description !== undefined
                          ? { routeDescription: route.description }
                          : {}),
                      },
                    },
                    destination: {
                      entity: siteContentEntity,
                      idPath: [route.id, section.id],
                      metadata: { routeId: route.id, sectionId: section.id },
                    },
                  }),
                ];
              }),
            );
            const result = await content.generate({
              targets,
              force: input.force,
              dryRun: input.dryRun,
            });
            const jobs = result.items.flatMap((item) => {
              if (item.status !== "queued") return [];
              const [routeId, sectionId] = item.destination.idPath;
              if (sectionId === undefined)
                throw new Error("Invalid generated section destination");
              return [{ jobId: item.jobId, routeId, sectionId }];
            });
            return {
              message: input.dryRun
                ? `Planned ${result.plannedTargets} sections. No jobs were queued.`
                : result.queuedTargets > 0
                  ? `Queued ${result.queuedTargets} of ${result.plannedTargets} sections. Jobs are running in the background.`
                  : "No new content to generate. No jobs were queued.",
              jobs,
              totalSections: result.plannedTargets,
              jobsQueued: result.queuedTargets,
              ...(result.batchId ? { batchId: result.batchId } : {}),
            };
          },
        }),
      ],
    },
  );
}
