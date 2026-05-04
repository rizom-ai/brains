import type {
  Plugin,
  EntityPluginContext,
  JobHandler,
  Template,
  DataSource,
  IShell,
  PluginCapabilities,
  CreateInput,
  CreateExecutionContext,
  CreateInterceptionResult,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { z, slugify } from "@brains/utils";
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
import { UrlUtils } from "./lib/url-utils";
import { LinkCaptureJobHandler } from "./handlers/capture-handler";
import packageJson from "../package.json";

export class LinkPlugin extends EntityPlugin<LinkEntity, LinkConfig> {
  readonly entityType = linkAdapter.entityType;
  readonly schema = linkSchema;
  readonly adapter = linkAdapter;
  private shell?: IShell;

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
    this.shell = shell;
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

  protected override async interceptCreate(
    input: CreateInput,
    executionContext: CreateExecutionContext,
    context: EntityPluginContext,
  ): Promise<CreateInterceptionResult> {
    if (input.content) {
      try {
        const parsed = this.adapter.fromMarkdown(input.content);
        const parsedMetadata = parsed.metadata as
          | Record<string, unknown>
          | undefined;
        const parsedTitle =
          typeof parsedMetadata?.["title"] === "string"
            ? parsedMetadata["title"]
            : undefined;
        const parsedStatus =
          typeof parsedMetadata?.["status"] === "string"
            ? parsedMetadata["status"]
            : undefined;
        const parsedUrl = this.extractFirstUrl(input.content);

        if (parsedTitle && parsedStatus && parsedUrl) {
          const id =
            slugify(parsedUrl) ||
            slugify(parsedTitle) ||
            `${input.entityType}-${Date.now()}`;
          const now = new Date().toISOString();
          const result = await context.entityService.createEntity({
            entity: {
              id,
              entityType: input.entityType,
              content: input.content,
              metadata: {
                title: parsedTitle,
                status: parsedStatus,
              },
              created: now,
              updated: now,
            },
          });

          return {
            kind: "handled",
            result: {
              success: true,
              data: { entityId: result.entityId, status: "created" },
            },
          };
        }
      } catch {
        // Fall through: raw URLs should route to capture below.
      }
    }

    const url =
      input.url ??
      this.extractFirstUrl(input.content, input.prompt, input.title);
    if (url) {
      if (!this.shell) {
        throw new Error(
          "LinkPlugin shell was not initialized during register()",
        );
      }

      try {
        const jobId = await this.shell.getJobQueueService().enqueue({
          type: "link-capture",
          data: {
            url,
            metadata: {
              interfaceId: executionContext.interfaceType,
              userId: executionContext.userId,
              ...(executionContext.channelId
                ? { channelId: executionContext.channelId }
                : {}),
              ...(executionContext.channelName
                ? { channelName: executionContext.channelName }
                : {}),
              timestamp: new Date().toISOString(),
            },
          },
          options: {
            source: this.id,
            metadata: {
              operationType: "data_processing",
              pluginId: this.id,
              interfaceType: executionContext.interfaceType,
              ...(executionContext.channelId
                ? { channelId: executionContext.channelId }
                : {}),
            },
          },
        });
        return {
          kind: "handled",
          result: { success: true, data: { status: "generating", jobId } },
        };
      } catch (error) {
        return {
          kind: "handled",
          result: {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to queue link capture job",
          },
        };
      }
    }

    if (input.content) {
      return {
        kind: "handled",
        result: {
          success: false,
          error:
            "Direct link creation requires full link markdown/frontmatter, or provide a URL to capture.",
        },
      };
    }

    if (input.prompt) {
      return {
        kind: "handled",
        result: {
          success: false,
          error:
            "Link creation requires a URL in the prompt, content, or title, or full link markdown content for direct creation.",
        },
      };
    }

    return { kind: "continue", input };
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
  private extractFirstUrl(
    ...values: Array<string | undefined>
  ): string | undefined {
    for (const value of values) {
      if (!value) continue;
      const [url] = UrlUtils.extractUrls(value);
      if (url) return url;
    }

    return undefined;
  }
}

export function createLinkPlugin(config: Partial<LinkConfig> = {}): Plugin {
  return new LinkPlugin(config);
}

export const linkPlugin = createLinkPlugin;
