import type {
  CreateCheckResult,
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
  Plugin,
  EntityPluginContext,
  EntityTypeConfig,
  JobHandler,
  DataSource,
  Template,
} from "@brains/plugins";
import {
  EntityPlugin,
  SYSTEM_CHANNELS,
  emptyEntityPluginConfigSchema,
} from "@brains/plugins";
import { publishRegisterContract } from "@brains/contracts";
import { fetchSiteInfo } from "@brains/site-composition";
import { fetchStyleGuide, formatVoiceGuidance } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { deckAdapter } from "./adapters/deck-adapter";
import { deckTemplate } from "./templates/deck-template";
import { deckListTemplate } from "./templates/deck-list";
import { deckGenerationTemplate } from "./templates/generation-template";
import { deckDescriptionTemplate } from "./templates/description-template";
import { DeckDataSource } from "./datasources/deck-datasource";
import { DeckGenerationJobHandler } from "./handlers/deckGenerationJobHandler";
import type { DeckEntity } from "./schemas/deck";
import {
  DECK_CAROUSEL_ATTACHMENT_TYPE,
  deckCarouselTemplate,
} from "./attachments/carousel-template";
import {
  DeckCarouselAttachmentProvider,
  type DeckCarouselAttachmentProviderDeps,
} from "./attachments/carousel-provider";
import {
  DECK_OG_IMAGE_ATTACHMENT_TYPE,
  deckOgImageTemplate,
} from "./attachments/og-image-template";
import { createDeckOgImageProvider } from "./attachments/og-image-provider";
import { createDeckAtprotoProjection } from "./atproto-projection";
import { checkDeckText, createDeckFromText } from "./lib/create-from-text";
import packageJson from "../package.json";

const generateDeckEvalInputSchema: z.ZodObject<{
  prompt: z.ZodString;
  event: z.ZodOptional<z.ZodString>;
}> = z.object({
  prompt: z.string(),
  event: z.string().optional(),
});

const generateDescriptionEvalInputSchema: z.ZodObject<{
  title: z.ZodString;
  content: z.ZodString;
}> = z.object({
  title: z.string(),
  content: z.string(),
});

type GenerateDeckEvalInput = z.output<typeof generateDeckEvalInputSchema>;
type GenerateDescriptionEvalInput = z.output<
  typeof generateDescriptionEvalInputSchema
>;

export type DecksPluginDeps = DeckCarouselAttachmentProviderDeps;

export class DecksPlugin extends EntityPlugin<
  DeckEntity,
  Record<string, never>,
  Record<string, never>
> {
  private readonly deps: DecksPluginDeps;
  readonly entityType: typeof deckAdapter.entityType = deckAdapter.entityType;
  readonly schema: typeof deckAdapter.schema = deckAdapter.schema;
  readonly adapter: typeof deckAdapter = deckAdapter;
  private unregisterCarouselAttachmentProvider: (() => void) | undefined;
  private unregisterOgImageAttachmentProvider: (() => void) | undefined;

  constructor(deps: DecksPluginDeps = {}) {
    super("decks", packageJson, {}, emptyEntityPluginConfigSchema);
    this.deps = deps;
  }

  protected override createGenerationHandler(
    context: EntityPluginContext,
  ): JobHandler | null {
    return new DeckGenerationJobHandler(
      this.logger.child("DeckGenerationJobHandler"),
      context,
    );
  }

  protected override getTemplates(): Record<string, Template> {
    return {
      "deck-detail": deckTemplate,
      "deck-list": deckListTemplate,
      generation: deckGenerationTemplate,
      description: deckDescriptionTemplate,
      "og-image": deckOgImageTemplate,
      carousel: deckCarouselTemplate,
    };
  }

  protected override getDataSources(): DataSource[] {
    return [new DeckDataSource(this.logger)];
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return { weight: 1.5, projectionSourceRole: "primary" };
  }

  protected override async checkCreate(
    input: CreateInput,
    _executionContext: CreateExecutionContext,
    context: EntityPluginContext,
  ): Promise<CreateCheckResult> {
    return checkDeckText(input, context);
  }

  protected override async interceptCreate(
    input: CreateInput,
    _executionContext: CreateExecutionContext,
    context: EntityPluginContext,
  ): Promise<CreateInterceptionResult> {
    return createDeckFromText(input, context);
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    this.deferPublishRegistration(context);
    this.registerCarouselAttachmentProvider(context);
    this.registerOgImageAttachmentProvider(context);
    this.registerEvalHandlers(context);
    context.atprotoProjections.register(createDeckAtprotoProjection());

    this.logger.info("Decks plugin registered");
  }

  protected override async onShutdown(): Promise<void> {
    this.unregisterCarouselAttachmentProvider?.();
    this.unregisterCarouselAttachmentProvider = undefined;
    this.unregisterOgImageAttachmentProvider?.();
    this.unregisterOgImageAttachmentProvider = undefined;
  }

  private deferPublishRegistration(context: EntityPluginContext): void {
    context.messaging.subscribe(SYSTEM_CHANNELS.pluginsRegistered, async () => {
      await context.messaging.command(publishRegisterContract, {
        entityType: "deck",
        provider: {
          name: "internal",
          publish: async (): Promise<{ id: string }> => ({ id: "internal" }),
        },
        config: { executionMode: "provider" },
      });
      return { success: true };
    });
  }

  private registerCarouselAttachmentProvider(
    context: EntityPluginContext,
  ): void {
    const deps: DecksPluginDeps = {
      ...this.deps,
      getThemeMode:
        this.deps.getThemeMode ??
        ((): Promise<"light" | "dark"> => siteThemeMode(context.entityService)),
    };
    this.unregisterCarouselAttachmentProvider = context.attachments.register(
      "deck",
      DECK_CAROUSEL_ATTACHMENT_TYPE,
      new DeckCarouselAttachmentProvider(context, deps),
    );
  }

  private registerOgImageAttachmentProvider(
    context: EntityPluginContext,
  ): void {
    this.unregisterOgImageAttachmentProvider = context.attachments.register(
      "deck",
      DECK_OG_IMAGE_ATTACHMENT_TYPE,
      createDeckOgImageProvider(context),
    );
  }

  private registerEvalHandlers(context: EntityPluginContext): void {
    context.eval.registerHandler("generateDeck", async (input: unknown) => {
      const parsed: GenerateDeckEvalInput =
        generateDeckEvalInputSchema.parse(input);
      const voiceGuidance = formatVoiceGuidance(
        await fetchStyleGuide(context.entityService),
      );
      return context.ai.generate(
        {
          prompt: `${parsed.prompt}${parsed.event ? `\n\nNote: This presentation is for "${parsed.event}".` : ""}`,
          templateName: "decks:generation",
          representedIdentity: "anchor",
          ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
        },
        z.object({
          title: z.string(),
          content: z.string(),
          description: z.string(),
        }),
      );
    });

    context.eval.registerHandler(
      "generateDescription",
      async (input: unknown) => {
        const parsed: GenerateDescriptionEvalInput =
          generateDescriptionEvalInputSchema.parse(input);
        const voiceGuidance = formatVoiceGuidance(
          await fetchStyleGuide(context.entityService),
        );
        return context.ai.generate(
          {
            prompt: `Title: ${parsed.title}\n\nContent:\n${parsed.content}`,
            templateName: "decks:description",
            representedIdentity: "none",
            ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
          },
          z.object({ description: z.string() }),
        );
      },
    );
  }
}

export function decksPlugin(): Plugin {
  return new DecksPlugin();
}

export default decksPlugin;

/**
 * The site's theme mode, which a deck carousel is drawn in: dark until the
 * site says otherwise, and when its site-info cannot be read.
 */
export async function siteThemeMode(
  entityService: Parameters<typeof fetchSiteInfo>[0],
): Promise<"light" | "dark"> {
  try {
    const info = await fetchSiteInfo(entityService);
    return info.themeMode ?? "dark";
  } catch {
    // No site-info yet, or one that does not parse: the carousel's default.
    return "dark";
  }
}
