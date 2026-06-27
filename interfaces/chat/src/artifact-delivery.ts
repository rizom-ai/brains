import {
  canReceiveNativeArtifactFile,
  getArtifactEntityFilename,
  parseArtifactDataUrl,
  resolveArtifactEntityRefFromCard,
  resolveMessageArtifactAccess,
  type InterfacePluginContext,
  type StructuredChatCard,
  type UserPermissionLevel,
} from "@brains/plugins";
import type { FileUpload } from "chat";

const DISCORD_NATIVE_ARTIFACT_MAX_BYTES = 8 * 1024 * 1024;

interface ArtifactDeliveryDeps {
  getContext: () => InterfacePluginContext | undefined;
  getDisplayBaseUrl: () => string | undefined;
  logger: { debug: (message: string, context?: Record<string, unknown>) => void };
}

/**
 * Resolves which generated artifacts to deliver to a chat caller: native files
 * for artifacts visible to their permission level, plus the ids of cards whose
 * artifact exists but is out of scope (so their links/metadata can be
 * suppressed). Pure delivery policy — extracted from ChatInterface and shared by
 * both the normal-response and confirmation-response render paths.
 */
export class ArtifactDeliveryResolver {
  constructor(private readonly deps: ArtifactDeliveryDeps) {}

  async resolve(
    cards: StructuredChatCard[] | undefined,
    userLevel: UserPermissionLevel,
  ): Promise<{ files: FileUpload[]; deniedCardIds: Set<string> }> {
    const files: FileUpload[] = [];
    const deniedCardIds = new Set<string>();
    if (!cards || !this.deps.getContext()) return { files, deniedCardIds };

    for (const card of cards) {
      if (card.kind !== "attachment") continue;
      const entityRef = resolveArtifactEntityRefFromCard(
        card,
        this.deps.getDisplayBaseUrl(),
      );
      if (!entityRef) continue;

      const resolved = await this.resolveCard(card, entityRef, userLevel).catch(
        (error: unknown) => {
          this.deps.logger.debug("Failed to resolve Discord artifact file", {
            error,
            cardId: card.id,
          });
          return undefined;
        },
      );
      if (resolved?.denied) deniedCardIds.add(card.id);
      if (resolved?.file) files.push(resolved.file);
    }
    return { files, deniedCardIds };
  }

  private async resolveCard(
    card: Extract<StructuredChatCard, { kind: "attachment" }>,
    entityRef: NonNullable<ReturnType<typeof resolveArtifactEntityRefFromCard>>,
    userLevel: UserPermissionLevel,
  ): Promise<{ file?: FileUpload; denied?: boolean }> {
    const context = this.deps.getContext();
    if (!context) return {};

    const access = await resolveMessageArtifactAccess({
      entityRef,
      userLevel,
      getEntity: (ref) => context.entityService.getEntity(ref),
      getVisibleEntity: (ref, visibilityScope) =>
        context.entityService.getEntity({ ...ref, visibilityScope }),
    });
    if (access.status === "denied") return { denied: true };
    if (access.status !== "visible") return {};
    const entity = access.entity;
    if (typeof entity.content !== "string") return {};
    if (!canReceiveNativeArtifactFile(userLevel)) return {};

    const parsed = parseArtifactDataUrl(entityRef.entityType, entity.content);
    if (!parsed) return {};
    if (parsed.data.byteLength > DISCORD_NATIVE_ARTIFACT_MAX_BYTES) {
      this.deps.logger.debug("Skipping oversized Discord artifact upload", {
        cardId: card.id,
        sizeBytes: parsed.data.byteLength,
      });
      return {};
    }

    return {
      file: {
        data: parsed.data,
        filename:
          card.attachment.filename ??
          getArtifactEntityFilename(
            entity.metadata,
            entityRef.id,
            entityRef.entityType,
            parsed.mimeType,
          ),
        mimeType: parsed.mimeType,
      },
    };
  }
}
