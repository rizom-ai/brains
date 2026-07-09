import { getActiveAuthService } from "@brains/auth-service";
import type { ServicePluginContext, WebRouteDefinition } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { CmsEntityDisplayMap } from "./config";
import { createEditorRoutes } from "./editor-routes";
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
 * operator passkey session, whose reads and writes go through the entity
 * service. Git persistence follows via directory-sync + git-sync — no
 * repository credential is ever sent to the browser.
 */
export class CmsPlugin extends ServicePlugin<
  CmsPluginConfig,
  CmsPluginConfigInput
> {
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
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return createEditorRoutes({
      routePath: this.config.routePath,
      getContext: () => this.getContext(),
      resolveOperatorSession: hasOperatorSession,
      getEntityDisplay: () =>
        (this.config.entityDisplay as CmsEntityDisplayMap | undefined) ??
        (this.getContext().entityDisplay as CmsEntityDisplayMap | undefined),
    });
  }
}

export function cmsPlugin(config: CmsPluginConfigInput = {}): CmsPlugin {
  return new CmsPlugin(config);
}

async function hasOperatorSession(request: Request): Promise<boolean> {
  return Boolean(await getActiveAuthService()?.getOperatorSession(request));
}
