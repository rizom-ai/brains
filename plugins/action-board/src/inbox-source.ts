import type {
  ServicePluginContext,
  InboxActor,
  InboxItem,
  InboxItemDetail,
  InboxSource,
} from "@brains/plugins";
import { truncateText } from "@brains/utils/string-utils";
import { ACTION_ITEM_ENTITY_TYPE } from "@brains/action-items";
import {
  actionItemBody,
  actionItemSource,
  actionItemTitle,
} from "@brains/action-items";
import { moveActionItem } from "@brains/action-items";
import { actionItemSchema, type ActionItemStatus } from "@brains/action-items";

/** Inbox actions on a blocked card and the status each moves it to. */
const MOVES: Readonly<Record<string, ActionItemStatus>> = {
  resume: "doing",
  done: "done",
  drop: "dropped",
};

function requireAdmin(actor: InboxActor): void {
  if (actor.permissionLevel !== "admin") {
    throw new Error("Action items inbox requires admin permission");
  }
}

/** The Inbox holds at most this many blockers, newest first. */
const LIST_LIMIT = 100;

/**
 * Blocked action items as Inbox items, so blockers reach the admin's triage
 * and daily digest. Every action goes through the board's move path.
 */
export class ActionItemInboxSource implements InboxSource {
  readonly sourceId: string = "action-items";
  readonly displayName: string = "Action items";
  private readonly context: Pick<ServicePluginContext, "entityService">;

  constructor(context: Pick<ServicePluginContext, "entityService">) {
    this.context = context;
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
    return blocked.map((entity) => {
      const summary = [
        ...(entity.metadata.assignedTo ?? []).map((assignee) => assignee.name),
        actionItemSource(entity).place,
      ].filter((segment) => segment.length > 0);
      return {
        id: entity.id,
        title: truncateText(actionItemTitle(entity), 160),
        summary: summary.join(" · "),
        // A blocked card's last change is, as a rule, its blocking.
        receivedAt: entity.updated,
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

  async resolveDetail(
    itemId: string,
    actor: InboxActor,
    signal: AbortSignal,
  ): Promise<InboxItemDetail> {
    requireAdmin(actor);
    signal.throwIfAborted();
    const entity = await this.context.entityService.getEntity(
      {
        entityType: ACTION_ITEM_ENTITY_TYPE,
        id: itemId,
        visibilityScope: "restricted",
      },
      actionItemSchema,
    );
    signal.throwIfAborted();
    if (!entity) throw new Error("Action item unavailable");
    const text = actionItemBody(entity.content)
      .trimStart()
      .replace(/^#\s+.+\n+/, "")
      .trim();
    return { kind: "plain", text, truncated: false };
  }

  async act(
    itemId: string,
    actionId: string,
    actor: InboxActor,
  ): Promise<void> {
    requireAdmin(actor);
    const to = MOVES[actionId];
    if (!to) throw new Error("Invalid action-items inbox action");
    const result = await moveActionItem(
      {
        entityService: this.context.entityService,
        visibilityScope: "restricted",
      },
      { id: itemId, from: "blocked", to },
    );
    if (result.status !== "moved") throw new Error("Action item unavailable");
  }
}
