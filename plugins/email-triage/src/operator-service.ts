import {
  assertCmsWorkspaceAdmin,
  type ServicePluginContext,
} from "@brains/plugins";
import { mailItemAdapter } from "./entity/adapters/mail-item-adapter";
import {
  mailItemSchema,
  type MailItemEntity,
  type MailStatus,
} from "./entity/schemas/mail-item";
import {
  mailTriageFilterSchema,
  mailTriageListItemSchema,
  mailTriageListResultSchema,
  mailTriageStatusActionResultSchema,
  mailTriageStatusActionSchema,
  mailTriageSummarySchema,
  mailTriageWorkspaceSnapshotSchema,
  type MailTriageFilter,
  type MailTriageListItem,
  type MailTriageListResult,
  type MailTriageStatusActionResult,
  type MailTriageSummary,
  type MailTriageWorkspaceSnapshot,
} from "./schemas/operator";

const WORKSPACE_ITEM_LIMIT = 100;

type OperatorContext = Pick<
  ServicePluginContext,
  "entityService" | "permissions"
>;

interface OperatorActor {
  userPermissionLevel?: "admin" | "trusted" | "public" | undefined;
}

export class MailTriageOperatorService {
  private readonly context: OperatorContext;

  constructor(context: OperatorContext) {
    this.context = context;
  }

  async list(filters: MailTriageFilter): Promise<MailTriageListResult> {
    const metadata = metadataFilter(filters);
    const [entities, total] = await Promise.all([
      this.context.entityService.listEntities<MailItemEntity>({
        entityType: "mail-item",
        options: {
          limit: filters.limit,
          sortFields: [{ field: "receivedAt", direction: "desc" }],
          filter: {
            metadata,
            visibilityScope: "restricted",
          },
        },
      }),
      this.context.entityService.countEntities({
        entityType: "mail-item",
        options: {
          filter: {
            metadata,
            visibilityScope: "restricted",
          },
        },
      }),
    ]);

    return mailTriageListResultSchema.parse({
      items: entities
        .map(toListItem)
        .sort(compareMailItems)
        .slice(0, filters.limit),
      total,
    });
  }

  async summary(): Promise<MailTriageSummary> {
    const [
      total,
      newCount,
      newHigh,
      reviewedHigh,
      newNeedsReply,
      reviewedNeedsReply,
      newUnclassified,
      reviewedUnclassified,
    ] = await Promise.all([
      this.count({}),
      this.count({ status: "new" }),
      this.count({ status: "new", priority: "high" }),
      this.count({ status: "reviewed", priority: "high" }),
      this.count({ status: "new", needsReply: true }),
      this.count({ status: "reviewed", needsReply: true }),
      this.count({ status: "new", category: null }),
      this.count({ status: "reviewed", category: null }),
    ]);

    return mailTriageSummarySchema.parse({
      total,
      new: newCount,
      high: newHigh + reviewedHigh,
      needsReply: newNeedsReply + reviewedNeedsReply,
      unclassified: newUnclassified + reviewedUnclassified,
    });
  }

  async snapshot(): Promise<MailTriageWorkspaceSnapshot> {
    const [items, summary] = await Promise.all([
      this.list(mailTriageFilterSchema.parse({ limit: WORKSPACE_ITEM_LIMIT })),
      this.summary(),
    ]);
    return mailTriageWorkspaceSnapshotSchema.parse({
      summary,
      items: items.items,
    });
  }

  async act(
    input: unknown,
    actor: OperatorActor,
  ): Promise<MailTriageStatusActionResult> {
    assertMailTriageAdmin(actor);
    const action = mailTriageStatusActionSchema.parse(input);
    this.context.permissions.assertEntityActionAllowed(
      "mail-item",
      "update",
      actor,
    );
    const entity = await this.context.entityService.getEntity<MailItemEntity>({
      entityType: "mail-item",
      id: action.id,
      visibilityScope: "restricted",
    });
    if (!entity) throw new Error("Mail item not found");

    const parsedEntity = mailItemSchema.parse(entity);
    const { frontmatter, summary } = mailItemAdapter.parseMailItemContent(
      parsedEntity.content,
    );
    const status = statusForAction(action.type);
    assertStatusTransition(frontmatter.status, status);
    if (frontmatter.status === status) {
      return mailTriageStatusActionResultSchema.parse({
        id: action.id,
        status,
      });
    }
    const content = mailItemAdapter.createMailItemContent(
      { ...frontmatter, status },
      summary,
    );
    await this.context.entityService.updateEntity({
      entity: {
        ...parsedEntity,
        content,
        metadata: { ...parsedEntity.metadata, status },
      },
    });

    return mailTriageStatusActionResultSchema.parse({ id: action.id, status });
  }

  private async count(
    filters: Omit<MailTriageFilter, "limit">,
  ): Promise<number> {
    return this.context.entityService.countEntities({
      entityType: "mail-item",
      options: {
        filter: {
          metadata: metadataFilter(filters),
          visibilityScope: "restricted",
        },
      },
    });
  }
}

export function assertMailTriageAdmin(actor: OperatorActor): void {
  assertCmsWorkspaceAdmin(actor, "Email triage");
}

function metadataFilter(
  filters: Omit<MailTriageFilter, "limit"> | MailTriageFilter,
): Record<string, unknown> {
  return {
    ...(filters.category !== undefined ? { category: filters.category } : {}),
    ...(filters.priority !== undefined ? { priority: filters.priority } : {}),
    ...(filters.status !== undefined ? { status: filters.status } : {}),
    ...(filters.needsReply !== undefined
      ? { needsReply: filters.needsReply }
      : {}),
  };
}

function toListItem(rawEntity: MailItemEntity): MailTriageListItem {
  const entity = mailItemSchema.parse(rawEntity);
  const { frontmatter, summary } = mailItemAdapter.parseMailItemContent(
    entity.content,
  );
  return mailTriageListItemSchema.parse({
    id: entity.id,
    title: frontmatter.title,
    category: frontmatter.category,
    priority: frontmatter.priority,
    status: frontmatter.status,
    needsReply: frontmatter.needsReply,
    receivedAt: frontmatter.receivedAt,
    summary,
    ...(frontmatter.senderLabel
      ? { senderLabel: frontmatter.senderLabel }
      : {}),
    ...(frontmatter.source.personId
      ? { personId: frontmatter.source.personId }
      : {}),
    ...(frontmatter.organization
      ? { organization: frontmatter.organization }
      : {}),
    requestedActions: frontmatter.requestedActions,
  });
}

function compareMailItems(
  left: MailTriageListItem,
  right: MailTriageListItem,
): number {
  return (
    right.receivedAt.localeCompare(left.receivedAt) ||
    left.id.localeCompare(right.id)
  );
}

function assertStatusTransition(from: MailStatus, to: MailStatus): void {
  const allowed: Record<MailStatus, MailStatus[]> = {
    new: ["reviewed", "handled", "archived"],
    reviewed: ["handled", "archived"],
    handled: ["archived"],
    archived: [],
  };
  if (from !== to && !allowed[from].includes(to)) {
    throw new Error("Invalid mail item status transition");
  }
}

function statusForAction(
  type: "mark-reviewed" | "mark-handled" | "archive",
): MailStatus {
  switch (type) {
    case "mark-reviewed":
      return "reviewed";
    case "mark-handled":
      return "handled";
    case "archive":
      return "archived";
  }
}
