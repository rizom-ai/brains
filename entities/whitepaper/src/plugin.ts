import type {
  Plugin,
  EntityPluginContext,
  EntityTypeConfig,
  JobHandler,
  Template,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { whitepaperSchema, type Whitepaper } from "./schemas/whitepaper";
import { whitepaperAdapter } from "./adapters/whitepaper-adapter";
import { WhitepaperGenerationJobHandler } from "./handlers/whitepaperGenerationJobHandler";
import { whitepaperGenerationTemplate } from "./templates/generation-template";
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

  protected override createGenerationHandler(
    context: EntityPluginContext,
  ): JobHandler | null {
    return new WhitepaperGenerationJobHandler(
      this.logger.child("WhitepaperGenerationJobHandler"),
      context,
    );
  }

  protected override getTemplates(): Record<string, Template> {
    return { generation: whitepaperGenerationTemplate };
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    context.eval.registerHandler(
      "generateWhitepaper",
      async (input: unknown) => {
        const parsed = z.object({ prompt: z.string() }).parse(input);
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
  }
}

export function whitepaperPlugin(): Plugin {
  return new WhitepaperPlugin();
}
