import {
  withdrawActionItem,
  type WithdrawActionItemDeps,
} from "@brains/action-items";
import type { SpaceNoticeAction, SpaceNoticeContent } from "@brains/contracts";
import type { ContentVisibility, IRuntimeStateStore } from "@brains/plugins";
import { noticeContent, withNotice } from "./notice";
import { updateBookmark, type ChannelBookmark } from "./pickup";

export interface ChannelUndoDeps {
  bookmarks: IRuntimeStateStore<ChannelBookmark>;
  entityService: WithdrawActionItemDeps["entityService"];
  /** The visibility the pickup gives its cards, and so the reach to find them. */
  visibility: ContentVisibility;
}

/** How many taken-back cards a conversation remembers. */
const REJECTED_KEPT = 500;

/**
 * An Undo click on a notice this plugin posted: take the card back unless
 * the board has changed it, remember it so the pickup never writes it again,
 * and answer with the notice as it now reads. Another plugin's notice gets
 * no answer.
 */
export async function undoNoticeCard(
  deps: ChannelUndoDeps,
  action: SpaceNoticeAction,
): Promise<SpaceNoticeContent | undefined> {
  const bookmark = await deps.bookmarks.get(action.conversationId);
  const notice = bookmark?.notices?.find(
    (candidate) => candidate.postedMessageId === action.noticeMessageId,
  );
  if (!notice) return undefined;
  const card = notice.cards.find((candidate) => candidate.id === action.value);
  if (!card || card.undo) return noticeContent(notice);

  const withdrawn = await withdrawActionItem(
    { entityService: deps.entityService, visibilityScope: deps.visibility },
    card.id,
  );
  const outcome = withdrawn.status === "kept" ? "kept" : "removed";
  await updateBookmark(deps.bookmarks, action.conversationId, (latest) => {
    const changed = withNotice(latest, notice.key, (current) => ({
      ...current,
      cards: current.cards.map((candidate) =>
        candidate.id === card.id && !candidate.undo
          ? { ...candidate, undo: { outcome, by: action.by } }
          : candidate,
      ),
    }));
    if (!changed || outcome === "kept") return changed;
    return {
      ...changed,
      rejected: [
        ...(changed.rejected ?? []).filter((id) => id !== card.id),
        card.id,
      ].slice(-REJECTED_KEPT),
    };
  });
  const latest = await deps.bookmarks.get(action.conversationId);
  const now = latest?.notices?.find(
    (candidate) => candidate.key === notice.key,
  );
  return noticeContent(now ?? notice);
}
