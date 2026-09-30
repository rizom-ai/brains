import {
  canReceiveNativeArtifactFile,
  getArtifactEntityFilename,
  readArtifactContent,
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

  async resolve(
    cards: StructuredChatCard[] | undefined,
    userLevel: UserPermissionLevel,
  ): Promise<{
    files: FileUpload[];
    deniedCardIds: Set<string>;
    deliveredCardIds: Set<string>;
  }> {
    const files: FileUpload[] = [];
    const deniedCardIds = new Set<string>();
    const deliveredCardIds = new Set<string>();
    if (!cards || !this.deps.getContext()) {
      return { files, deniedCardIds, deliveredCardIds };
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
    return { files, deniedCardIds, deliveredCardIds };
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
      // Access checks read references; bytes load only for delivery.
      getEntity: (ref) =>
        context.entityService.getEntity({ ...ref, binaryContent: "reference" }),
      getVisibleEntity: (ref, visibilityScope) =>
        context.entityService.getEntity({
          ...ref,
          visibilityScope,
          binaryContent: "reference",
        }),
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
    if (!canReceiveNativeArtifactFile(userLevel)) return {};

    const parsed = await readArtifactContent(
      context.entityService,
      entityRef.entityType,
      entity,
      CHAT_NATIVE_ARTIFACT_MAX_BYTES,
    );
    if (!parsed) return {};
    if (parsed.status === "oversized") {
      this.deps.logger.debug("Skipping oversized chat artifact upload", {
        cardId: card.id,
        sizeBytes: parsed.sizeBytes,
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
