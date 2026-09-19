import {
  canReceiveNativeArtifactFile,
  getArtifactEntityFilename,
  resolveArtifactEntityData,
  resolveArtifactEntityRefFromCard,
  resolveMessageArtifactAccess,
  type InterfacePluginContext,
  type StructuredChatCard,
  type UserPermissionLevel,
} from "@brains/plugins";
import type { FileUpload } from "chat";

const CHAT_NATIVE_ARTIFACT_MAX_BYTES = 8 * 1024 * 1024;
const NON_DELIVERABLE_ARTIFACT_STATUSES = new Set([
  "pending",
  "generating",
  "failed",
  "error",
]);

export interface ArtifactDelivery {
  files: FileUpload[];
  deniedCardIds: Set<string>;
  deliveredCardIds: Set<string>;
}
interface ArtifactCardDelivery {
  file?: FileUpload;
  denied?: boolean;
}

interface ArtifactDeliveryDeps {
  getContext: () => InterfacePluginContext | undefined;
  getDisplayBaseUrl: () => string | undefined;
  logger: {
    debug: (message: string, context?: Record<string, unknown>) => void;
  };
}

/**
 * Resolves which generated artifacts to deliver to a chat caller: native files
 * for artifacts visible to their permission level, plus the ids of cards whose
 * artifact exists but is out of scope (so their links/metadata can be
 * suppressed). Pure delivery policy — extracted from ChatInterface and shared by
 * both the normal-response and confirmation-response render paths.
 */
export class ArtifactDeliveryResolver {
  private readonly deps: ArtifactDeliveryDeps;

  constructor(deps: ArtifactDeliveryDeps) {
    this.deps = deps;
  }

  /** The consumer must await all transport sends before releasing this scope. */
  async withFiles<T>(
    cards: StructuredChatCard[] | undefined,
    userLevel: UserPermissionLevel,
    use: (delivery: ArtifactDelivery) => Promise<T>,
  ): Promise<T> {
    const files: FileUpload[] = [];
    const deniedCardIds = new Set<string>();
    const deliveredCardIds = new Set<string>();
    if (!cards || !this.deps.getContext()) {
      return use({ files, deniedCardIds, deliveredCardIds });
    }

    for (const card of cards) {
      if (card.kind !== "attachment") continue;
      const entityRef = resolveArtifactEntityRefFromCard(
        card,
        this.deps.getDisplayBaseUrl(),
      );
      if (!entityRef) continue;

      const resolved = await this.resolveCard(card, entityRef, userLevel).catch(
        (error: unknown) => {
          this.deps.logger.debug("Failed to resolve chat artifact file", {
            error,
            cardId: card.id,
          });
          return undefined;
        },
      );
      if (resolved?.denied) deniedCardIds.add(card.id);
      if (resolved?.file) {
        files.push(resolved.file);
        deliveredCardIds.add(card.id);
      }
    }
    // A send failure is not a missing attachment. Keep consumption outside
    // optional-resolution catches and never retry the consumer.
    return use({ files, deniedCardIds, deliveredCardIds });
  }

  private async resolveCard(
    card: Extract<StructuredChatCard, { kind: "attachment" }>,
    entityRef: NonNullable<ReturnType<typeof resolveArtifactEntityRefFromCard>>,
    userLevel: UserPermissionLevel,
  ): Promise<ArtifactCardDelivery> {
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
    const entityStatus = entity.metadata["status"];
    if (
      typeof entityStatus === "string" &&
      NON_DELIVERABLE_ARTIFACT_STATUSES.has(entityStatus)
    ) {
      return {};
    }
    if (typeof entity.content !== "string") return {};
    if (!canReceiveNativeArtifactFile(userLevel)) return {};

    const parsed = await resolveArtifactEntityData(
      entityRef.entityType,
      entity.content,
      entity.metadata,
      context.entityService,
    );
    if (!parsed) return {};
    if (parsed.data.byteLength > CHAT_NATIVE_ARTIFACT_MAX_BYTES) {
      this.deps.logger.debug("Skipping oversized chat artifact upload", {
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
