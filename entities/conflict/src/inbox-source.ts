import type {
  InboxActor,
  InboxItem,
  InboxItemDetail,
  InboxSource,
} from "@brains/sdk/internal/service-runtime";
import { truncateText } from "@brains/utils/string-utils";
import type { ConflictItem, ConflictStore } from "./lib/conflict-store";

const APPLY = "apply";
const KEEP = "keep-current";
/** The most text an Inbox detail carries. */
const DETAIL_LIMIT = 100_000;
const TITLE_LIMIT = 160;
const REF_LIMIT = 300;

const ORIGINS: Record<ConflictItem["origin"], string> = {
  studio: "a save in Studio",
  drive: "a save on the drive",
  file: "a file in brain-data",
  git: "a git pull",
};

/**
 * Conflicts as Inbox items: each names the entry an edit lost to and where
 * the edit came from, shows how it differs from the current version, and
 * offers to apply it or keep what is there. The listing carries no text; it
 * is gathered with no viewer behind it.
 */
export class ConflictInboxSource implements InboxSource {
  readonly sourceId: string = "conflicts";
  readonly displayName: string = "Conflicts";
  private readonly store: ConflictStore;

  constructor(store: ConflictStore) {
    this.store = store;
  }

  async list(): Promise<InboxItem[]> {
    return (await this.store.list()).map((conflict) => ({
      id: conflict.itemId,
      title: truncateText(
        `${conflict.targetType}/${conflict.targetId}`,
        TITLE_LIMIT,
      ),
      summary: `An edit from ${ORIGINS[conflict.origin]} was made over an older version and was not saved over the current one.`,
      receivedAt: conflict.created,
      urgency: "normal",
      ...(conflict.targetId.length <= REF_LIMIT
        ? {
            entityRef: {
              entityType: conflict.targetType,
              entityId: conflict.targetId,
            },
          }
        : {}),
      actions: [
        // Replaces the current version, so the Inbox asks first.
        { id: APPLY, label: "Apply this version", confirm: true },
        { id: KEEP, label: "Keep current" },
      ],
    }));
  }

  async resolveDetail(
    itemId: string,
    actor: InboxActor,
  ): Promise<InboxItemDetail> {
    const text = await this.store.detail(itemId, actor);
    return {
      kind: "plain",
      text: text.slice(0, DETAIL_LIMIT),
      truncated: text.length > DETAIL_LIMIT,
    };
  }

  async act(
    itemId: string,
    actionId: string,
    actor: InboxActor,
  ): Promise<void> {
    if (actionId === APPLY) return this.store.apply(itemId, actor);
    if (actionId === KEEP) return this.store.dismiss(itemId);
    throw new Error(`Unknown conflict action: ${actionId}`);
  }
}
