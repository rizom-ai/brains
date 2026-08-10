import {
  inboxItemListSchema,
  type InboxAction,
  type InboxActor,
  type InboxItem,
  type InboxSource,
} from "@brains/plugins";
import type { MailTriageOperatorService } from "./operator-service";
import {
  mailTriageStatusActionSchema,
  type MailTriageListItem,
} from "./schemas/operator";

const INBOX_ITEM_LIMIT = 100;

export class MailTriageInboxSource implements InboxSource {
  readonly sourceId: string = "mail-items";
  readonly displayName: string = "Email Triage";

  private readonly operator: MailTriageOperatorService;

  constructor(operator: MailTriageOperatorService) {
    this.operator = operator;
  }

  async list(): Promise<InboxItem[]> {
    const result = await this.operator.list({
      status: "new",
      limit: INBOX_ITEM_LIMIT,
    });
    return inboxItemListSchema.parse(result.items.map(toInboxItem));
  }

  async act(
    itemId: string,
    actionId: string,
    actor: InboxActor,
  ): Promise<void> {
    const action = mailTriageStatusActionSchema.safeParse({
      type: actionId,
      id: itemId,
    });
    if (!action.success) {
      throw new Error("Invalid email triage inbox action");
    }
    await this.operator.act(action.data, {
      userPermissionLevel: actor.permissionLevel,
    });
  }
}

function toInboxItem(item: MailTriageListItem): InboxItem {
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    ...(item.senderLabel
      ? {
          contact: {
            label: item.senderLabel,
            ...(item.personId ? { personId: item.personId } : {}),
          },
        }
      : {}),
    receivedAt: item.receivedAt,
    urgency: item.priority === "high" ? "high" : "normal",
    entityRef: { entityType: "mail-item", entityId: item.id },
    actions: inboxActions(),
  };
}

function inboxActions(): InboxAction[] {
  return [
    { id: "mark-reviewed", label: "Mark reviewed" },
    { id: "mark-handled", label: "Mark handled" },
    { id: "archive", label: "Archive", confirm: true },
  ];
}
