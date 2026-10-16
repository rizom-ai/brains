import type {
  Plugin,
  EntityPluginContext,
  EntityTypeConfig,
  JobHandler,
  DataSource,
  Template,
  CreateInput,
  CreateExecutionContext,
  CreateInterceptionResult,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { whitepaperSchema, type Whitepaper } from "./schemas/whitepaper";
import { whitepaperAdapter } from "./adapters/whitepaper-adapter";
import { WhitepaperGenerationJobHandler } from "./handlers/whitepaperGenerationJobHandler";
import { WhitepaperDataSource } from "./datasources/whitepaper-datasource";
import { getTemplates } from "./lib/register-templates";
import { WhitepaperPrintableAttachmentProvider } from "./attachments/printable-provider";
import { WHITEPAPER_PRINTABLE_ATTACHMENT_TYPE } from "./attachments/printable-template";
import packageJson from "../package.json";

export class WhitepaperPlugin extends EntityPlugin<Whitepaper> {
  readonly entityType = whitepaperAdapter.entityType;
  readonly schema = whitepaperSchema;
  readonly adapter = whitepaperAdapter;
  private unregisterPrintableAttachmentProvider: (() => void) | undefined;

  constructor() {
    super("whitepaper", packageJson, {}, undefined);
  }

  public override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return {
      weight: 1.2,
      publish: { publishStatuses: ["published"] },
    };
  }

  protected override async interceptCreate(
    input: CreateInput,
    _executionContext: CreateExecutionContext,
    context: EntityPluginContext,
  ): Promise<CreateInterceptionResult> {
    if (
      input.targetEntityType !== "whitepaper" ||
      !input.targetEntityId ||
      !input.prompt
    ) {
      return { kind: "continue", input };
    }

    const target = await context.entityService.getEntity({
      entityType: "whitepaper",
      id: input.targetEntityId,
      visibilityScope: "restricted",
    });
    if (!target) {
      return {
        kind: "handled",
        result: {
          success: false,
          error: `Target whitepaper not found: ${input.targetEntityId}`,
        },
      };
    }

    const jobId = await context.jobs.enqueue({
      type: "whitepaper:generation",
      data: {
        entityId: target.id,
        mode: "draft",
        prompt: input.prompt,
        ...(input.title && { title: input.title }),
        ...(input.content && { content: input.content }),
      },
    });

    return {
      kind: "handled",
      result: {
        success: true,
        data: {
          entityId: target.id,
          status: "generating",
          jobId,
        },
      },
    };
  }

  protected override createGenerationHandler(
    context: EntityPluginContext,
  ): JobHandler | null {
    return new WhitepaperGenerationJobHandler(
      this.logger.child("WhitepaperGenerationJobHandler"),
      context,
    );
  }

  protected override getTemplates(): Record<string, Template> {
    return getTemplates();
  }

  protected override getDataSources(): DataSource[] {
    return [
      new WhitepaperDataSource(this.logger.child("WhitepaperDataSource")),
    ];
  }

  protected override async getInstructions(): Promise<string> {
    return 'For new white paper requests, use system_create with entityType: "whitepaper" and a prompt or exact markdown content. Prompt-based whitepaper creation generates an outline-stage whitepaper. To expand an existing whitepaper outline into a draft, first resolve the target with system_get or system_search, then call system_create with entityType: "whitepaper", a prompt describing the expansion, targetEntityType: "whitepaper", and targetEntityId set to the existing whitepaper id. This updates the existing whitepaper to status draft instead of creating a second whitepaper.';
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    this.unregisterPrintableAttachmentProvider = context.attachments.register(
      "whitepaper",
      WHITEPAPER_PRINTABLE_ATTACHMENT_TYPE,
      new WhitepaperPrintableAttachmentProvider(context),
    );

    const generatedSchema = z.object({
      prompt: z.string(),
      outline: z.string().optional(),
    });
    context.eval.registerHandler(
      "generateWhitepaper",
      async (input: unknown) => {
        const parsed = generatedSchema.pick({ prompt: true }).parse(input);
        return context.ai.generate<{
          title: string;
          subtitle: string;
          thesis: string;
          abstract: string;
          keywords: string[];
          body: string;
        }>({
          prompt: parsed.prompt,
          templateName: "whitepaper:generation",
        });
      },
    );
    context.eval.registerHandler(
      "expandWhitepaperDraft",
      async (input: unknown) => {
        const parsed = generatedSchema.parse(input);
        return context.ai.generate<{
          title: string;
          subtitle: string;
          thesis: string;
          abstract: string;
          keywords: string[];
          body: string;
        }>({
          prompt: parsed.outline
            ? `${parsed.prompt}\n\nExisting white paper outline:\n${parsed.outline}`
            : parsed.prompt,
          templateName: "whitepaper:draft-expansion",
        });
      },
    );
  }

  protected override async onShutdown(): Promise<void> {
    this.unregisterPrintableAttachmentProvider?.();
    this.unregisterPrintableAttachmentProvider = undefined;
  }
}

export function whitepaperPlugin(): Plugin {
  return new WhitepaperPlugin();
}
