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
  private readonly readiness: { isReady(): Promise<boolean> } | undefined;

  constructor(
    operator: MailTriageOperatorService,
    readiness?: { isReady(): Promise<boolean> },
  ) {
    this.operator = operator;
    this.readiness = readiness;
  }

  async list(): Promise<InboxItem[]> {
    const [result, threadOrdinalsReady] = await Promise.all([
      this.operator.list({ status: "new", limit: INBOX_ITEM_LIMIT }),
      this.readiness?.isReady() ?? Promise.resolve(false),
    ]);
    return inboxItemListSchema.parse(
      result.items.map((item) => toInboxItem(item, threadOrdinalsReady)),
    );
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

function toInboxItem(
  item: MailTriageListItem,
  threadOrdinalsReady: boolean,
): InboxItem {
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
    ...(threadOrdinalsReady && item.threadOrdinal !== undefined
      ? { threadOrdinal: item.threadOrdinal }
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
