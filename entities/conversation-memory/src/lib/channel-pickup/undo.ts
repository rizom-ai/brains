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
import {
  decisionSchema,
  insightSchema,
} from "../../schemas/conversation-memory";
import { DECISION_ENTITY_TYPE, INSIGHT_ENTITY_TYPE } from "../constants";
import type { ClaimKind } from "./claim-extractor";
import type { MemoryEntityService } from "../memory-context";
import { claimEntityType, rewriteOwnClaim } from "./own-claims";
import { updateBookmark, type ChannelBookmark } from "./pickup";

export interface ChannelUndoDeps {
  bookmarks: ClassRuntimeStateStore<ChannelBookmark>;
  entityService: WithdrawActionItemDeps["entityService"] &
    Pick<MemoryEntityService, "listEntities" | "updateEntity">;
  /** The visibility the pickup gives its cards, and so the reach to find them. */
  visibility: ContentVisibility;
}

/** How many taken-back cards a conversation remembers. */
const REJECTED_KEPT = 500;

/**
 * Take back a decision or an insight the pickup wrote. The delete holds only
 * while it still reads as the pickup wrote it, by the hash the bookmark
 * recorded; one edited since, or with no record, is kept.
 */
async function takeBackClaim(
  deps: ChannelUndoDeps,
  written: string | undefined,
  claim: { kind: ClaimKind; id: string },
): Promise<"removed" | "kept"> {
  if (!written) return "kept";
  const deleted = await deps.entityService.deleteEntity({
    entityType: claimEntityType(claim.kind),
    id: claim.id,
    options: { expectedContentHash: written },
  });
  return deleted ? "removed" : "kept";
}

/**
 * Bring back what a taken-back claim had superseded, decisions and insights
 * alike: each the pickup wrote and nobody has edited is active again and
 * names no replacement. Returns their new hashes, by id.
 */
async function restoreSuperseded(
  deps: ChannelUndoDeps,
  own: Readonly<Record<string, string>>,
  takenBack: string,
): Promise<Record<string, string>> {
  const options = {
    filter: {
      metadata: { supersededBy: takenBack },
      visibilityScope: deps.visibility,
    },
  };
  const [decisions, insights] = await Promise.all([
    deps.entityService.listEntities(
      { entityType: DECISION_ENTITY_TYPE, options },
      decisionSchema,
    ),
    deps.entityService.listEntities(
      { entityType: INSIGHT_ENTITY_TYPE, options },
      insightSchema,
    ),
  ]);
  const replaced = [
    ...decisions.map(({ id }) => ({ kind: "decision" as const, id })),
    ...insights.map(({ id }) => ({ kind: "insight" as const, id })),
  ];
  const restored = await Promise.all(
    replaced.map(async (claim) => {
      const rewritten = await rewriteOwnClaim(
        deps.entityService,
        own[claim.id],
        claim,
        { status: "active" },
      );
      return rewritten ? [[claim.id, rewritten.hash] as const] : [];
    }),
  );
  return Object.fromEntries(restored.flat());
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

  const outcome = card.kind
    ? await takeBackClaim(deps, bookmark?.own?.[card.id], {
        kind: card.kind,
        id: card.id,
      })
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
  const restored =
    card.kind && outcome === "removed"
      ? await restoreSuperseded(deps, bookmark?.own ?? {}, card.id)
      : {};
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
    const { [card.id]: _taken, ...own } = { ...changed.own, ...restored };
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
