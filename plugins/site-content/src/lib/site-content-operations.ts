import { formatVoiceGuidance, styleGuideFromRecord } from "@brains/contracts";
import type { ServicePluginContext, ToolContext } from "@brains/plugins";
import {
  siteBuilderRoutesContract,
  type RouteDefinition,
} from "@brains/site-composition";
import type { GenerateOptions } from "../schemas/generate-options";

export class SiteContentOperations {
  private readonly context: ServicePluginContext;
  constructor(context: ServicePluginContext) {
    this.context = context;
  }

  /** Site copy is public, so only a public style guide may shape it. */
  private async fetchPublicVoiceGuidance(): Promise<string> {
    const styleGuide = await this.context.entityService.getEntity({
      entityType: "style-guide",
      id: "style-guide",
    });
    return styleGuide?.visibility === "public"
      ? formatVoiceGuidance(styleGuideFromRecord(styleGuide))
      : "";
  }

  private async fetchRoutes(): Promise<RouteDefinition[]> {
    const result = await this.context.messaging.request(
      siteBuilderRoutesContract,
      {},
    );
    if (result.status !== "answered") {
      throw new Error("Failed to fetch routes from site-builder");
    }
    return result.data;
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
    const voiceGuidance = await this.fetchPublicVoiceGuidance();
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
        styleGuide?: { voice: string };
      };
      destination: {
        entityType: "site-content";
        idPath: [string, string];
        metadata: Record<string, never>;
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
              routeTitle: route.title,
              routeDescription: route.description,
            },
            ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
          },
          destination: {
            entityType: "site-content",
            idPath: [route.id, section.id],
            metadata: {},
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
