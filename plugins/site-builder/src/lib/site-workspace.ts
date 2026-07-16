import {
  CMS_WORKSPACE_REGISTER_MESSAGE,
  PermissionService,
  type CmsWorkspaceRegistration,
  type ServicePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { SiteBuilderConfig } from "../config";
import type { RouteRegistry } from "@brains/site-engine";
import type {
  SiteBuildEnvironment,
  SiteBuildStatusService,
} from "./site-build-status";
import { resolveSiteMetadata } from "./site-metadata";

const registrationResultSchema = z.object({
  workspaceUrl: z.string(),
});

export type SiteWorkspaceAction =
  { type: "build-preview" } | { type: "build-production"; confirmed: true };

export const siteWorkspaceActionSchema: z.ZodType<SiteWorkspaceAction> =
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("build-preview") }),
    z.object({
      type: z.literal("build-production"),
      confirmed: z.literal(true),
    }),
  ]);

export interface SiteWorkspaceSnapshot {
  site: {
    title: string;
    previewUrl?: string | undefined;
    liveUrl?: string | undefined;
  };
  automation: {
    autoRebuild: boolean;
    debounceMs: number;
    defaultEnvironment: SiteBuildEnvironment;
  };
  environments: Awaited<
    ReturnType<SiteBuildStatusService["getSnapshot"]>
  >["environments"];
  recentBuilds: Awaited<
    ReturnType<SiteBuildStatusService["getSnapshot"]>
  >["recentBuilds"];
  routes: Array<{ id: string; path: string; title: string }>;
}

export interface SiteWorkspaceProviderOptions {
  context: ServicePluginContext;
  config: SiteBuilderConfig;
  routeRegistry: RouteRegistry;
  statusService: SiteBuildStatusService;
  requestBuild: (environment: SiteBuildEnvironment) => void;
}

export class SiteWorkspaceProvider {
  private readonly options: SiteWorkspaceProviderOptions;

  constructor(options: SiteWorkspaceProviderOptions) {
    this.options = options;
  }

  async getSnapshot(): Promise<SiteWorkspaceSnapshot> {
    const { context, config, routeRegistry, statusService } = this.options;
    const [metadata, status] = await Promise.all([
      resolveSiteMetadata(context.messaging.send, config.siteInfo),
      statusService.getSnapshot(),
    ]);

    return {
      site: {
        title: metadata.title,
        ...(context.previewUrl ? { previewUrl: context.previewUrl } : {}),
        ...(context.siteUrl ? { liveUrl: context.siteUrl } : {}),
      },
      automation: {
        autoRebuild: config.autoRebuild,
        debounceMs: config.rebuildDebounce,
        defaultEnvironment: config.previewOutputDir ? "preview" : "production",
      },
      environments: status.environments,
      recentBuilds: status.recentBuilds,
      routes: routeRegistry.list().map((route) => ({
        id: route.id,
        path: route.path,
        title: route.title,
      })),
    };
  }

  async registerCmsWorkspace(): Promise<string | undefined> {
    const registration: CmsWorkspaceRegistration = {
      id: "site",
      pluginId: "site-builder",
      label: "Site",
      rendererName: "SiteWorkspace",
      priority: 50,
      dataProvider: () => this.getSnapshot(),
      actionHandler: async (request, actor) => {
        if (
          !PermissionService.hasPermission(actor.userPermissionLevel, "anchor")
        ) {
          throw new Error("Site build requires anchor permission");
        }
        const action = siteWorkspaceActionSchema.safeParse(request);
        if (!action.success) throw new Error("Invalid site workspace action");

        const environment =
          action.data.type === "build-preview" ? "preview" : "production";
        this.options.requestBuild(environment);
        return { accepted: true, environment };
      },
    };

    const response = await this.options.context.messaging.send({
      type: CMS_WORKSPACE_REGISTER_MESSAGE,
      payload: registration,
    });
    if (!("success" in response) || !response.success) return undefined;

    const parsed = registrationResultSchema.safeParse(response.data);
    return parsed.success ? parsed.data.workspaceUrl : undefined;
  }
}
