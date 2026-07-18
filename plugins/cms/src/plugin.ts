import { getActiveAuthService } from "@brains/auth-service";
import type {
  CmsWorkspaceRegistration,
  CmsWorkspaceRegistrationResult,
  ServicePluginContext,
  WebRouteDefinition,
} from "@brains/plugins";
import { CMS_WORKSPACE_REGISTER_MESSAGE, ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { CmsEntityDisplayMap } from "./config";
import { createEditorRoutes } from "./editor-routes";
import { CmsWorkspaceRegistry } from "./workspace-registry";
import packageJson from "../package.json";

interface CmsEntityDisplayEntry {
  label?: string | undefined;
  pluralName?: string | undefined;
}

interface CmsPluginConfig {
  entityDisplay?: Record<string, CmsEntityDisplayEntry> | undefined;
  routePath: string;
}

interface CmsPluginConfigInput {
  entityDisplay?: Record<string, CmsEntityDisplayEntry> | undefined;
  routePath?: string | undefined;
}

const entityDisplayEntrySchema: z.ZodType<
  CmsEntityDisplayEntry,
  CmsEntityDisplayEntry
> = z.looseObject({
  label: z.string().optional(),
  pluralName: z.string().optional(),
});

const cmsPluginConfigSchema: z.ZodType<CmsPluginConfig, CmsPluginConfigInput> =
  z.object({
    entityDisplay: z.record(z.string(), entityDisplayEntrySchema).optional(),
    routePath: z.string().default("/cms"),
  });

/**
 * First-party CMS editor: a React app served at `routePath`, gated on the
 * authenticated passkey session, whose reads and writes go through the entity
 * service. Git persistence follows via directory-sync + git-sync — no
 * repository credential is ever sent to the browser.
 */
export class CmsPlugin extends ServicePlugin<
  CmsPluginConfig,
  CmsPluginConfigInput
> {
  private readonly workspaceRegistry = new CmsWorkspaceRegistry();

  constructor(config: CmsPluginConfigInput = {}) {
    super("cms", packageJson, config, cmsPluginConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.endpoints.register({
      label: "CMS",
      url: this.config.routePath,
      priority: 40,
      visibility: "anchor",
    });
    context.interactions.register({
      id: "cms",
      label: "CMS",
      description: "Edit and manage content through the browser CMS.",
      href: this.config.routePath,
      kind: "admin",
      priority: 40,
      visibility: "anchor",
    });

    context.messaging.subscribe<
      CmsWorkspaceRegistration,
      CmsWorkspaceRegistrationResult
    >(CMS_WORKSPACE_REGISTER_MESSAGE, async (message) => {
      try {
        const workspace = this.workspaceRegistry.register(message.payload);
        return {
          success: true,
          data: {
            workspaceUrl: `${this.config.routePath}#/workspace/${encodeURIComponent(workspace.id)}`,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return createEditorRoutes({
      routePath: this.config.routePath,
      getContext: () => this.getContext(),
      resolveAuthSession: hasAnchorAuthSession,
      getEntityDisplay: () =>
        (this.config.entityDisplay as CmsEntityDisplayMap | undefined) ??
        (this.getContext().entityDisplay as CmsEntityDisplayMap | undefined),
      workspaceRegistry: this.workspaceRegistry,
    });
  }
}

export function cmsPlugin(config: CmsPluginConfigInput = {}): CmsPlugin {
  return new CmsPlugin(config);
}

async function hasAnchorAuthSession(request: Request): Promise<boolean> {
  const principal = await getActiveAuthService()?.resolveSession(request);
  return principal?.permissionLevel === "anchor";
}
