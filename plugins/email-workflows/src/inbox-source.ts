import {
  inboxItemListSchema,
  type EntityInboxDeclaration,
  type EntityReactionContext,
  type InboxAction,
  type InboxFacetDefinition,
  type InboxItem,
  type InboxItemDetail,
} from "@brains/sdk/entities";
import { MailTriageOperatorService } from "./operator-service";
import {
  mailTriageStatusActionSchema,
  type MailTriageListItem,
} from "./schemas/operator";
import { EmailWorkflowsSourceReader } from "./source-read";

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

export interface MailTriageInboxDependencies {
  /** Whether thread positions are complete enough to show. */
  readonly threadOrdinals: { isReady(): Promise<boolean> };
}

/**
 * New mail items as inbox attention: content-safe projections with the two
 * actions an operator takes on them. The body of an item is read back from
 * the mailbox on demand, through the interface that delivered it.
 */
export function mailTriageInbox(
  deps: MailTriageInboxDependencies,
): EntityInboxDeclaration {
  const operator = (
    context: EntityReactionContext,
  ): MailTriageOperatorService =>
    new MailTriageOperatorService({
      entities: context.entities,
      permissions: context.permissions,
    });

  return {
    sourceId: "mail-items",
    displayName: "Email Triage",
    facets: MAIL_FACETS,

    list: async (context): Promise<InboxItem[]> => {
      const [result, threadOrdinalsReady] = await Promise.all([
        operator(context).listInboxItems(),
        deps.threadOrdinals.isReady(),
      ]);
      return inboxItemListSchema.parse(
        result.map((item) => toInboxItem(item, threadOrdinalsReady)),
      );
    },

    resolveDetail: async (
      context,
      itemId,
      actor,
      signal,
    ): Promise<InboxItemDetail> => {
      const reader = new EmailWorkflowsSourceReader(
        context.messaging,
        operator(context),
      );
      const source = await reader.read({ itemId, actor, signal });
      if (source.kind !== "available") {
        throw new Error("Mail source is unavailable");
      }
      return {
        kind: "plain",
        text: source.message.text,
        truncated: source.message.truncated,
      };
    },

    act: async (context, itemId, actionId, actor): Promise<void> => {
      const action = mailTriageStatusActionSchema.safeParse({
        type: actionId,
        id: itemId,
      });
      if (!action.success) {
        throw new Error("Invalid email triage inbox action");
      }
      await operator(context).act(action.data, {
        userPermissionLevel: actor.permissionLevel,
      });
    },
  };
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
    { id: "mark-handled", label: "Done" },
    { id: "archive", label: "Dismiss", confirm: true },
  ];
}
