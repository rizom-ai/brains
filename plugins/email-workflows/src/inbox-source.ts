import {
  inboxItemListSchema,
  type InboxAction,
  type InboxActor,
  type InboxFacetDefinition,
  type InboxItem,
  type InboxItemDetail,
  type InboxSource,
} from "@brains/plugins";
import type { MailTriageOperatorService } from "./operator-service";
import {
  mailTriageStatusActionSchema,
  type MailTriageListItem,
} from "./schemas/operator";
import type { EmailWorkflowsSourceReader } from "./source-read";

const MAIL_FACETS: InboxFacetDefinition[] = [
  {
    key: "category",
    label: "Category",
    values: [
      { value: "opportunity", label: "Opportunity" },
      { value: "recruiting", label: "Recruiting" },
      { value: "work", label: "Work" },
      { value: "administrative", label: "Administrative" },
      { value: "personal", label: "Personal" },
      { value: "unclassified", label: "Unclassified" },
    ],
  },
  {
    key: "mail-priority",
    label: "Mail priority",
    values: [
      { value: "high", label: "High" },
      { value: "normal", label: "Normal" },
      { value: "low", label: "Low" },
    ],
  },
  {
    key: "needs-reply",
    label: "Needs reply",
    values: [
      { value: "true", label: "Yes" },
      { value: "false", label: "No" },
    ],
  },
];

export class MailTriageInboxSource implements InboxSource {
  readonly sourceId: string = "mail-items";
  readonly displayName: string = "Email Triage";
  readonly facets: InboxFacetDefinition[] = MAIL_FACETS;

  private readonly operator: MailTriageOperatorService;
  private readonly readiness: { isReady(): Promise<boolean> } | undefined;
  private readonly sourceReader:
    Pick<EmailWorkflowsSourceReader, "read"> | undefined;

  constructor(
    operator: MailTriageOperatorService,
    readiness?: { isReady(): Promise<boolean> },
    sourceReader?: Pick<EmailWorkflowsSourceReader, "read">,
  ) {
    this.operator = operator;
    this.readiness = readiness;
    this.sourceReader = sourceReader;
  }

  async list(): Promise<InboxItem[]> {
    const [result, threadOrdinalsReady] = await Promise.all([
      this.operator.listInboxItems(),
      this.readiness?.isReady() ?? Promise.resolve(false),
    ]);
    return inboxItemListSchema.parse(
      result.map((item) => toInboxItem(item, threadOrdinalsReady)),
    );
  }

  async resolveDetail(
    itemId: string,
    actor: InboxActor,
    signal: AbortSignal,
  ): Promise<InboxItemDetail> {
    if (!this.sourceReader) throw new Error("Mail source is unavailable");
    const source = await this.sourceReader.read({ itemId, actor, signal });
    if (source.kind !== "available") {
      throw new Error("Mail source is unavailable");
    }
    return {
      kind: "plain",
      text: source.message.text,
      truncated: source.message.truncated,
    };
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
    facets: {
      category: item.category ?? "unclassified",
      "mail-priority": item.priority,
      "needs-reply": String(item.needsReply),
    },
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
