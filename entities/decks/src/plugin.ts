import type {
  Plugin,
  EntityPluginContext,
  EntityTypeConfig,
  JobHandler,
  DataSource,
  Template,
} from "@brains/plugins";
import { EntityPlugin, emptyEntityPluginConfigSchema } from "@brains/plugins";
import { AtprotoProjectionRegistry } from "@brains/atproto-contracts";
import { fetchSiteInfo } from "@brains/site-info";
import { getErrorMessage } from "@brains/utils";
import { z } from "@brains/utils/zod-v4";
import { deckAdapter } from "./adapters/deck-adapter";
import { deckTemplate } from "./templates/deck-template";
import { deckListTemplate } from "./templates/deck-list";
import { deckGenerationTemplate } from "./templates/generation-template";
import { deckDescriptionTemplate } from "./templates/description-template";
import { DeckDataSource } from "./datasources/deck-datasource";
import { DeckGenerationJobHandler } from "./handlers/deckGenerationJobHandler";
import type { DeckEntity } from "./schemas/deck";
import { DECK_CAROUSEL_ATTACHMENT_TYPE } from "./attachments/carousel-template";
import {
  DeckCarouselAttachmentProvider,
  type DeckCarouselAttachmentProviderDeps,
} from "./attachments/carousel-provider";
import { DECK_OG_IMAGE_ATTACHMENT_TYPE } from "./attachments/og-image-template";
import { DeckOgImageAttachmentProvider } from "./attachments/og-image-provider";
import { createDeckAtprotoProjection } from "./atproto-projection";
import packageJson from "../package.json";

const generateDeckEvalInputSchema = z.object({
  prompt: z.string(),
  event: z.string().optional(),
});

const generateDescriptionEvalInputSchema = z.object({
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
  readonly entityType = deckAdapter.entityType;
  readonly schema = deckAdapter.schema;
  readonly adapter = deckAdapter;
  private unregisterCarouselAttachmentProvider: (() => void) | undefined;
  private unregisterOgImageAttachmentProvider: (() => void) | undefined;
  private unregisterAtprotoProjection: (() => void) | undefined;

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
    };
  }

  protected override getDataSources(): DataSource[] {
    return [new DeckDataSource(this.logger)];
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return { weight: 1.5 };
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    this.deferPublishRegistration(context);
    this.subscribeToPublishExecute(context);
    this.registerCarouselAttachmentProvider(context);
    this.registerOgImageAttachmentProvider(context);
    this.registerEvalHandlers(context);
    this.unregisterAtprotoProjection =
      AtprotoProjectionRegistry.getInstance().register(
        createDeckAtprotoProjection(),
      );

    this.logger.info("Decks plugin registered");
  }

  protected override async onShutdown(): Promise<void> {
    this.unregisterCarouselAttachmentProvider?.();
    this.unregisterCarouselAttachmentProvider = undefined;
    this.unregisterOgImageAttachmentProvider?.();
    this.unregisterOgImageAttachmentProvider = undefined;
    this.unregisterAtprotoProjection?.();
    this.unregisterAtprotoProjection = undefined;
  }

  private deferPublishRegistration(context: EntityPluginContext): void {
    context.messaging.subscribe("system:plugins:ready", async () => {
      await context.messaging.send({
        type: "publish:register",
        payload: {
          entityType: "deck",
          provider: {
            name: "internal",
            publish: async (): Promise<{ id: string }> => ({ id: "internal" }),
          },
          config: { executionMode: "provider" },
        },
      });
      return { success: true };
    });
  }

  private subscribeToPublishExecute(context: EntityPluginContext): void {
    context.messaging.subscribe<
      { entityType: string; entityId: string },
      { success: boolean }
    >("publish:execute", async (msg) => {
      const { entityType, entityId } = msg.payload;
      if (entityType !== "deck") return { success: true };

      try {
        const deck = await context.entityService.getEntity<DeckEntity>({
          entityType: "deck",
          id: entityId,
        });
        if (!deck) {
          await context.messaging.send({
            type: "publish:report:failure",
            payload: {
              entityType,
              entityId,
              error: `Deck not found: ${entityId}`,
            },
          });
          return { success: true };
        }

        if (deck.metadata.status === "published") return { success: true };

        const publishedAt = new Date().toISOString();
        const updatedDeck: DeckEntity = {
          ...deck,
          metadata: { ...deck.metadata, status: "published", publishedAt },
        };

        await context.entityService.updateEntity({
          entity: {
            ...updatedDeck,
            content: this.adapter.toMarkdown(updatedDeck),
          },
        });

        await context.messaging.send({
          type: "publish:report:success",
          payload: {
            entityType,
            entityId,
            result: { id: entityId },
          },
        });
      } catch (error) {
        await context.messaging.send({
          type: "publish:report:failure",
          payload: {
            entityType,
            entityId,
            error: getErrorMessage(error),
          },
        });
      }

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
        (async (): Promise<"light" | "dark"> => {
          try {
            const info = await fetchSiteInfo(context.entityService);
            return info.themeMode ?? "dark";
          } catch {
            return "dark";
          }
        }),
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
      new DeckOgImageAttachmentProvider(context),
    );
  }

  private registerEvalHandlers(context: EntityPluginContext): void {
    context.eval.registerHandler("generateDeck", async (input: unknown) => {
      const parsed: GenerateDeckEvalInput =
        generateDeckEvalInputSchema.parse(input);
      return context.ai.generate<{
        title: string;
        content: string;
        description: string;
      }>({
        prompt: `${parsed.prompt}${parsed.event ? `\n\nNote: This presentation is for "${parsed.event}".` : ""}`,
        templateName: "decks:generation",
      });
    });

    context.eval.registerHandler(
      "generateDescription",
      async (input: unknown) => {
        const parsed: GenerateDescriptionEvalInput =
          generateDescriptionEvalInputSchema.parse(input);
        return context.ai.generate<{ description: string }>({
          prompt: `Title: ${parsed.title}\n\nContent:\n${parsed.content}`,
          templateName: "decks:description",
        });
      },
    );
  }
}

export function decksPlugin(): Plugin {
  return new DecksPlugin();
}

export default decksPlugin;
