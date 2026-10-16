import type {
  EntityPluginContext,
  InboxActionActor,
  InboxItem,
  InboxSource,
} from "@brains/plugins";
import { truncateText } from "@brains/utils/string-utils";
import { ACTION_ITEM_ENTITY_TYPE } from "./constants";
import { actionItemTitle, arrivedAt } from "./action-item-board";
import { moveActionItem } from "./action-item-moves";
import { channelLabel, formatAge } from "./widgets/format";
import {
  actionItemSchema,
  type ActionItemStatus,
} from "../schemas/conversation-memory";

/** Inbox actions on a blocked card and the status each moves it to. */
const MOVES: Readonly<Record<string, ActionItemStatus>> = {
  resume: "doing",
  done: "done",
  drop: "dropped",
};

/** The Inbox holds at most this many blockers, newest first. */
const LIST_LIMIT = 100;

/**
 * Blocked action items as Inbox items, so blockers reach the admin's triage
 * and daily digest. Every action goes through the board's move path, so the
 * card's history names the admin who acted.
 */
export class ActionItemInboxSource implements InboxSource {
  readonly sourceId: string = "action-items";
  readonly displayName: string = "Action items";
  private readonly context: Pick<EntityPluginContext, "entityService">;
  private readonly now: () => Date;

  constructor(
    context: Pick<EntityPluginContext, "entityService">,
    now: () => Date = (): Date => new Date(),
  ) {
    this.context = context;
    this.now = now;
  }

  async list(): Promise<InboxItem[]> {
    const blocked = await this.context.entityService.listEntities(
      {
        entityType: ACTION_ITEM_ENTITY_TYPE,
        options: {
          filter: {
            metadata: { status: "blocked" },
            visibilityScope: "restricted",
          },
          sortFields: [{ field: "updated", direction: "desc" }],
          limit: LIST_LIMIT,
        },
      },
      actionItemSchema,
    );
    const now = this.now();
    return blocked.map((entity) => {
      const since =
        arrivedAt(entity, "blocked") ?? entity.metadata.timeRange.end;
      const summary = [
        `Blocked ${formatAge(since, now)}`,
        ...(entity.metadata.assignedTo ?? []).map(
          (assignee) => assignee.displayName,
        ),
        channelLabel(entity.metadata.channelName, entity.metadata.channelId),
      ].filter((segment) => segment.length > 0);
      return {
        id: entity.id,
        title: truncateText(actionItemTitle(entity), 160),
        summary: summary.join(" · "),
        receivedAt: since,
        urgency: "normal",
        entityRef: { entityType: ACTION_ITEM_ENTITY_TYPE, entityId: entity.id },
        actions: [
          { id: "resume", label: "Resume" },
          { id: "done", label: "Done" },
          { id: "drop", label: "Drop", confirm: true },
        ],
      };
    });
  }

  async act(
    itemId: string,
    actionId: string,
    actor: InboxActionActor,
  ): Promise<void> {
    if (actor.permissionLevel !== "admin") {
      throw new Error("Action items inbox requires admin permission");
    }
    const to = MOVES[actionId];
    if (!to) throw new Error("Invalid action-items inbox action");
    const result = await moveActionItem(
      {
        entityService: this.context.entityService,
        visibilityScope: "restricted",
        now: this.now,
      },
      { id: itemId, from: "blocked", to, actor: actor.actor },
    );
    if (result.status !== "moved") throw new Error("Action item unavailable");
  }
}
