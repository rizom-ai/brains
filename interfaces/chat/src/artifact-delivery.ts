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
import {
  deliverArtifactFile,
  AcknowledgedFileDeliveryError,
  type FileDeliveryAdapter,
  type FileDeliveryRequest,
} from "./file-delivery";

import { CHAT_NATIVE_ARTIFACT_MAX_BYTES } from "./artifact-limits";
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
  /** Invoke once after the primary message; the enclosing scope joins it. */
  sendFiles?: (onAttempt?: (cardId: string) => void) => Promise<void>;
}
interface NativeArtifactRequest {
  cardId: string;
  request: FileDeliveryRequest;
}
interface ArtifactCardDelivery {
  fileRequest?: FileDeliveryRequest;
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
    adapter?: FileDeliveryAdapter<unknown>,
  ): Promise<T> {
    const files: FileUpload[] = [];
    const deniedCardIds = new Set<string>();
    const deliveredCardIds = new Set<string>();
    const native: NativeArtifactRequest[] = [];
    const context = this.deps.getContext();
    if (!cards || !context) {
      return use({ files, deniedCardIds, deliveredCardIds });
    }

    for (const card of cards) {
      if (card.kind !== "attachment") continue;
      const entityRef = resolveArtifactEntityRefFromCard(
        card,
        this.deps.getDisplayBaseUrl(),
      );
      if (!entityRef) continue;

      const resolved = await this.resolveCard(
        card,
        entityRef,
        userLevel,
        adapter !== undefined,
      ).catch((error: unknown) => {
        this.deps.logger.debug("Failed to resolve chat artifact file", {
          error,
          cardId: card.id,
        });
        return undefined;
      });
      if (resolved?.fileRequest)
        native.push({ cardId: card.id, request: resolved.fileRequest });
      if (resolved?.denied) deniedCardIds.add(card.id);
      if (resolved?.file) {
        files.push(resolved.file);
        deliveredCardIds.add(card.id);
      }
    }
    // A send failure is not a missing attachment. Keep consumption outside
    // optional-resolution catches and never retry the consumer.
    const delivery = { files, deniedCardIds, deliveredCardIds };
    if (!adapter || native.length === 0) return use(delivery);
    return this.consumeNative(
      delivery,
      use,
      async (signal, onAttempt): Promise<void> => {
        // Serial independent loans preserve the existing runtime/actor budgets.
        // Stop on the first uncertain result; never replay earlier acknowledgements.
        for (const entry of native) {
          signal.throwIfAborted();
          onAttempt?.(entry.cardId);
          try {
            const result = await deliverArtifactFile(
              { ...entry.request, signal },
              context.entityService,
              adapter,
            );
            if (result.status === "delivered")
              deliveredCardIds.add(entry.cardId);
            if (result.status === "denied") deniedCardIds.add(entry.cardId);
          } catch (error) {
            if (error instanceof AcknowledgedFileDeliveryError)
              deliveredCardIds.add(entry.cardId);
            throw error;
          }
        }
      },
    );
  }

  private async consumeNative<T>(
    delivery: ArtifactDelivery,
    use: (delivery: ArtifactDelivery) => Promise<T>,
    send: (
      signal: AbortSignal,
      onAttempt?: (cardId: string) => void,
    ) => Promise<void>,
  ): Promise<T> {
    const lifetime = new AbortController();
    let open = true;
    let entered = false;
    let sent: Promise<void> | undefined;
    const errors: unknown[] = [];
    const remember = (error: unknown): void => {
      if (!errors.includes(error)) errors.push(error);
    };
    delivery.sendFiles = (onAttempt): Promise<void> => {
      if (!open || entered)
        return Promise.reject(
          new Error("Artifact sends are closed or already entered"),
        );
      entered = true;
      sent = send(lifetime.signal, onAttempt);
      // Observe immediately even if the consumer fails to await its send.
      void sent.catch(remember);
      return sent;
    };
    let outcome: { value: T } | undefined;
    try {
      outcome = { value: await use(delivery) };
    } catch (error) {
      remember(error);
      lifetime.abort(error);
    }
    open = false;
    if (sent) {
      try {
        await sent;
      } catch (error) {
        remember(error);
      }
    } else if (outcome)
      remember(new Error("Artifact consumer did not enter file delivery"));
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1)
      throw new AggregateError(
        errors,
        "Artifact consumption and delivery failed",
        { cause: errors[0] },
      );
    if (!outcome) throw new Error("Artifact consumer has no outcome");
    return outcome.value;
  }

  private async resolveCard(
    card: Extract<StructuredChatCard, { kind: "attachment" }>,
    entityRef: NonNullable<ReturnType<typeof resolveArtifactEntityRefFromCard>>,
    userLevel: UserPermissionLevel,
    fileDelivery: boolean,
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

    if (fileDelivery && entity.content.startsWith("asset:")) {
      return {
        fileRequest: {
          entityRef,
          userLevel,
          ...(card.attachment.filename !== undefined && {
            filename: card.attachment.filename,
          }),
        },
      };
    }

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
