import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import {
  type InboxActor,
  type InboxItem,
  type InboxItemDetail,
  type InboxSource,
  internalFullScope,
  permissionToVisibilityScope,
} from "@brains/sdk/internal/service-runtime";
import type { ServicePermissions } from "@brains/sdk/internal/service-runtime";
import type { FormEntityService } from "./records";
import type { FormInbox, FormInboxTarget } from "./target";

/** What the source reads and writes through. */
export interface FormInboxContext {
  entityService: FormEntityService;
  permissions: ServicePermissions;
}

const MARK_HANDLED = "mark-handled";

/**
 * A target's new records as Inbox to-dos, each marked Done there. Registry
 * listing is an internal pull operation; every user surface enforces the
 * Inbox admin floor. Details and actions also check the actor here. Errors
 * never echo private content or backend details.
 */
export class FormInboxSource<
  E extends BaseEntity = BaseEntity,
> implements InboxSource {
  readonly sourceId: string;
  readonly displayName: string;
  private readonly context: FormInboxContext;
  private readonly target: FormInboxTarget<E>;
  private readonly inbox: FormInbox<E>;

  constructor(context: FormInboxContext, target: FormInboxTarget<E>) {
    this.context = context;
    this.target = target;
    this.inbox = target.inbox;
    this.sourceId = target.inbox.sourceId;
    this.displayName = target.inbox.displayName;
  }

  async list(): Promise<InboxItem[]> {
    const { entityType, schema } = this.target;
    try {
      const entities = await this.context.entityService.listEntities(
        {
          entityType,
          options: {
            limit: 1000,
            sortFields: [{ field: "receivedAt", direction: "desc" }],
            filter: {
              visibilityScope: internalFullScope(
                `${this.inbox.label.toLowerCase()} inbox is admin-only`,
              ),
              metadata: { ...this.inbox.listFilter, status: "new" },
            },
          },
        },
        schema,
      );
      return entities.flatMap((entity): InboxItem[] => {
        if (this.target.handled(entity)) return [];
        const item = this.inbox.item(entity);
        if (!item) return [];
        return [
          {
            id: entity.id,
            ...item,
            urgency: "normal",
            entityRef: { entityType, entityId: entity.id },
            actions: [{ id: MARK_HANDLED, label: "Done" }],
          },
        ];
      });
    } catch {
      throw new Error(`${this.inbox.label} inbox unavailable`);
    }
  }

  async resolveDetail(
    itemId: string,
    actor: InboxActor,
    signal: AbortSignal,
  ): Promise<InboxItemDetail> {
    this.requireAdmin(actor);
    signal.throwIfAborted();
    try {
      const entity = await this.read(itemId, actor);
      signal.throwIfAborted();
      return {
        kind: "plain",
        text: this.inbox.detail(entity),
        truncated: false,
      };
    } catch {
      signal.throwIfAborted();
      throw this.unavailable();
    }
  }

  async act(
    itemId: string,
    actionId: string,
    actor: InboxActor,
  ): Promise<void> {
    this.requireAdmin(actor);
    if (actionId !== MARK_HANDLED)
      throw new Error(`Invalid ${this.inbox.label.toLowerCase()} inbox action`);
    this.context.permissions.assertEntityActionAllowed(
      this.target.entityType,
      "update",
      { userPermissionLevel: actor.permissionLevel },
    );
    try {
      const entity = await this.read(itemId, actor);
      if (this.target.handled(entity)) return;
      // Conditional on the record as read: a concurrent change, such as its
      // alert settling, fails the action instead of being overwritten.
      const result = await this.context.entityService.updateEntity({
        entity: { ...entity, ...this.inbox.withHandled(entity) },
        options: { expectedContentHash: entity.contentHash },
      });
      if (result.skipped) throw this.unavailable();
    } catch {
      throw this.unavailable();
    }
  }

  private requireAdmin(actor: InboxActor): void {
    if (actor.permissionLevel !== "admin")
      throw new Error(`${this.inbox.label} inbox requires admin permission`);
  }

  private unavailable(): Error {
    return new Error(`${this.inbox.recordLabel} unavailable`);
  }

  /** At the actor's own scope. */
  private async read(itemId: string, actor: InboxActor): Promise<E> {
    const entity = await this.context.entityService.getEntity(
      {
        entityType: this.target.entityType,
        id: itemId,
        visibilityScope: permissionToVisibilityScope(actor.permissionLevel),
      },
      this.target.schema,
    );
    if (!entity) throw this.unavailable();
    return entity;
  }
}
