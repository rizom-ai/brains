import type {
  Plugin,
  EntityPluginContext,
  JobHandler,
  Template,
  DataSource,
  IShell,
  PluginCapabilities,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import {
  linkConfigSchema,
  linkSchema,
  type LinkConfig,
  type LinkEntity,
} from "./schemas/link";
import { linkAdapter } from "./adapters/link-adapter";
import {
  linkExtractionTemplate,
  type LinkExtractionResult,
} from "./templates/extraction-template";
import { linkListTemplate } from "./templates/link-list";
import { linkDetailTemplate } from "./templates/link-detail";
import { LinksDataSource } from "./datasources/links-datasource";
import { UrlFetcher } from "./lib/url-fetcher";
import { LinkCaptureJobHandler } from "./handlers/capture-handler";
import packageJson from "../package.json";

export class LinkPlugin extends EntityPlugin<LinkEntity, LinkConfig> {
  readonly entityType = linkAdapter.entityType;
  readonly schema = linkSchema;
  readonly adapter = linkAdapter;

  constructor(config: Partial<LinkConfig> = {}) {
    super("link", packageJson, config, linkConfigSchema);
  }

  /**
   * `EntityPlugin` auto-registers generation handlers as `${entityType}:generation`.
   * Link capture also has a dedicated public job name used by `system_create`.
   * Register that alias here so core stays generic and does not need to know
   * about plugin-scoped handler naming.
   */
  override async register(shell: IShell): Promise<PluginCapabilities> {
    const capabilities = await super.register(shell);

    if (!this.context) {
      throw new Error(
        "LinkPlugin context was not initialized during register()",
      );
    }

    shell
      .getJobQueueService()
      .registerHandler(
        "link-capture",
        new LinkCaptureJobHandler(
          this.logger.child("LinkCaptureJobHandler"),
          this.context,
          this.config.jinaApiKey
            ? { jinaApiKey: this.config.jinaApiKey }
            : undefined,
        ),
        this.id,
      );

    return capabilities;
  }

  protected override createGenerationHandler(
    context: EntityPluginContext,
  ): JobHandler | null {
    return new LinkCaptureJobHandler(
      this.logger.child("LinkCaptureJobHandler"),
      context,
      this.config.jinaApiKey
        ? { jinaApiKey: this.config.jinaApiKey }
        : undefined,
    );
  }

  protected override getTemplates(): Record<string, Template> {
    return {
      extraction: linkExtractionTemplate,
      "link-list": linkListTemplate,
      "link-detail": linkDetailTemplate,
    };
  }

  protected override getDataSources(): DataSource[] {
    return [new LinksDataSource(this.logger.child("LinksDataSource"))];
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    context.eval.registerHandler("extractContent", async (input: unknown) => {
      const { url } = z.object({ url: z.string().url() }).parse(input);
      const urlFetcher = new UrlFetcher(
        this.config.jinaApiKey
          ? { jinaApiKey: this.config.jinaApiKey }
          : undefined,
      );
      const fetchResult = await urlFetcher.fetch(url);
      if (!fetchResult.success) {
        return {
          success: false,
          error: fetchResult.error,
          errorType: fetchResult.errorType,
        };
      }
      return context.ai.generate<LinkExtractionResult>({
        templateName: "link:extraction",
        prompt: `Extract structured information from this webpage content:\n\n${fetchResult.content}`,
        data: { url, hasContent: true },
        interfacePermissionGrant: "public",
      });
    });
  }
}

export function createLinkPlugin(config: Partial<LinkConfig> = {}): Plugin {
  return new LinkPlugin(config);
}

export const linkPlugin = createLinkPlugin;
