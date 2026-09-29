import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import type { ServicePluginContext, ToolContext } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { GenerateOptions } from "../schemas/generate-options";

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

const routesResponseSchema = z.array(routeSchema);

type SiteContentRoute = z.output<typeof routeSchema>;

export class SiteContentOperations {
  private readonly context: ServicePluginContext;
  constructor(context: ServicePluginContext) {
    this.context = context;
  }

  private async fetchRoutes(): Promise<SiteContentRoute[]> {
    const response = await this.context.messaging.send({
      type: SITE_BUILDER_CHANNELS.routesList,
      payload: {},
    });
    if ("noop" in response) {
      throw new Error(
        "No handler for site-builder:routes:list — is site-builder plugin loaded?",
      );
    }
    if (!response.success || !response.data) {
      throw new Error("Failed to fetch routes from site-builder");
    }
    const parsed = routesResponseSchema.safeParse(response.data);
    if (!parsed.success) {
      throw new Error("Failed to parse routes from site-builder");
    }
    return parsed.data;
  }

  /** Discovers site targets; the tool context carries the caller and cancellation. */
  async generate(
    options: GenerateOptions,
    toolContext?: ToolContext,
  ): Promise<{
    jobs: Array<{ jobId: string; routeId: string; sectionId: string }>;
    totalSections: number;
    queuedSections: number;
    batchId: string;
  }> {
    const signal = toolContext?.signal;
    signal?.throwIfAborted();
    const logger = this.context.logger.child("SiteContentOperations");

    const routes = await this.fetchRoutes();
    signal?.throwIfAborted();

    let targetRoutes = routes;
    if (options.routeId) {
      targetRoutes = routes.filter((r) => r.id === options.routeId);
      if (targetRoutes.length === 0) {
        throw new Error(`Route not found: ${options.routeId}`);
      }
    }

    const targets: Array<{
      templateName: string;
      context: {
        data: {
          routeId: string;
          sectionId: string;
          routeTitle?: string;
          routeDescription?: string;
        };
      };
      destination: {
        entityType: "site-content";
        idPath: [string, string];
        metadata: { routeId: string; sectionId: string };
      };
    }> = [];

    for (const route of targetRoutes) {
      for (const section of route.sections) {
        if (options.sectionId && section.id !== options.sectionId) continue;

        if (section.content) {
          logger.debug("Section has static content, skipping", {
            routeId: route.id,
            sectionId: section.id,
          });
          continue;
        }
        if (!section.template) {
          logger.debug("Section has no template, skipping", {
            routeId: route.id,
            sectionId: section.id,
          });
          continue;
        }

        targets.push({
          templateName: section.template,
          context: {
            data: {
              routeId: route.id,
              sectionId: section.id,
              ...(route.title !== undefined && { routeTitle: route.title }),
              ...(route.description !== undefined && {
                routeDescription: route.description,
              }),
            },
          },
          destination: {
            entityType: "site-content",
            idPath: [route.id, section.id],
            metadata: { routeId: route.id, sectionId: section.id },
          },
        });
      }
    }

    const result = await this.context.content.generate({
      targets,
      toolContext,
      ...(options.force !== undefined && { force: options.force }),
      ...(options.dryRun !== undefined && { dryRun: options.dryRun }),
      ...(signal && { signal }),
    });
    const jobs = result.items.flatMap((item) => {
      if (item.status !== "queued" || !item.jobId) return [];
      const [routeId, sectionId] = item.destination.idPath;
      if (!routeId || !sectionId) return [];
      return [{ jobId: item.jobId, routeId, sectionId }];
    });

    return {
      jobs,
      totalSections: result.plannedTargets,
      queuedSections: result.queuedTargets,
      batchId: result.batchId ?? "",
    };
  }
}
