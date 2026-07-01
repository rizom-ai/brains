import type {
  Plugin,
  EntityPluginContext,
  EntityTypeConfig,
  JobHandler,
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
import { whitepaperGenerationTemplate } from "./templates/generation-template";
import { whitepaperDraftExpansionTemplate } from "./templates/draft-expansion-template";
import packageJson from "../package.json";

export class WhitepaperPlugin extends EntityPlugin<Whitepaper> {
  readonly entityType = whitepaperAdapter.entityType;
  readonly schema = whitepaperSchema;
  readonly adapter = whitepaperAdapter;

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
    return {
      generation: whitepaperGenerationTemplate,
      "draft-expansion": whitepaperDraftExpansionTemplate,
    };
  }

  protected override async getInstructions(): Promise<string> {
    return 'For new white paper requests, use system_create with entityType: "whitepaper" and a prompt or exact markdown content. Prompt-based whitepaper creation generates an outline-stage whitepaper. To expand an existing whitepaper outline into a draft, first resolve the target with system_get or system_search, then call system_create with entityType: "whitepaper", a prompt describing the expansion, targetEntityType: "whitepaper", and targetEntityId set to the existing whitepaper id. This updates the existing whitepaper to status draft instead of creating a second whitepaper.';
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
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
}

export function whitepaperPlugin(): Plugin {
  return new WhitepaperPlugin();
}
