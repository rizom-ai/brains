import {
  withdrawActionItem,
  type WithdrawActionItemDeps,
} from "@brains/action-items";
import type { SpaceNoticeAction, SpaceNoticeContent } from "@brains/contracts";
import type {
  ClassRuntimeStateStore,
  ContentVisibility,
} from "@brains/sdk/internal/service-runtime";
import { noticeContent, withNotice } from "./notice";
import { DECISION_ENTITY_TYPE } from "../constants";
import { updateBookmark, type ChannelBookmark } from "./pickup";

export interface ChannelUndoDeps {
  bookmarks: ClassRuntimeStateStore<ChannelBookmark>;
  entityService: WithdrawActionItemDeps["entityService"];
  /** The visibility the pickup gives its cards, and so the reach to find them. */
  visibility: ContentVisibility;
}

/** How many taken-back cards a conversation remembers. */
const REJECTED_KEPT = 500;

/**
 * Take back a decision the pickup wrote. The delete holds only while the
 * decision still reads as the pickup wrote it, by the hash the bookmark
 * recorded; one edited since, or with no record, is kept.
 */
async function takeBackDecision(
  deps: ChannelUndoDeps,
  written: string | undefined,
  id: string,
): Promise<"removed" | "kept"> {
  if (!written) return "kept";
  const deleted = await deps.entityService.deleteEntity({
    entityType: DECISION_ENTITY_TYPE,
    id,
    options: { expectedContentHash: written },
  });
  return deleted ? "removed" : "kept";
}

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

  const outcome =
    card.kind === "decision"
      ? await takeBackDecision(deps, bookmark?.own?.[card.id], card.id)
      : (
            await withdrawActionItem(
              {
                entityService: deps.entityService,
                visibilityScope: deps.visibility,
              },
              card.id,
            )
          ).status === "kept"
        ? "kept"
        : "removed";
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
    const { [card.id]: _taken, ...own } = changed.own ?? {};
    return {
      ...changed,
      ...(changed.own ? { own } : {}),
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
