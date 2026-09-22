import type {
  BaseEntity,
  InboxActor,
  InboxItem,
  InboxItemDetail,
  InboxSource,
  ServicePluginContext,
} from "@brains/plugins";
import { contactRequestAdapter } from "./entity/adapter";
import {
  contactRequestSchema,
  type ContactFrontmatter,
  type ContactRequest,
} from "./entity/schema";

type ContactInboxContext = Pick<ServicePluginContext, "entityService"> & {
  permissions: Pick<
    ServicePluginContext["permissions"],
    "assertEntityActionAllowed"
  >;
};
interface ParsedRequest {
  entity: ContactRequest;
  frontmatter: ContactFrontmatter;
  message: string;
}

function requireAdmin(actor: InboxActor): void {
  if (actor.permissionLevel !== "admin")
    throw new Error("Contact inbox requires admin permission");
}

function parseRequest(entity: BaseEntity | null, now: number): ParsedRequest {
  const parsed = contactRequestSchema.parse(entity);
  const content = contactRequestAdapter.parseContent(parsed.content);
  if (Date.parse(content.frontmatter.expiresAt) <= now)
    throw new Error("Contact request unavailable");
  return { entity: parsed, ...content };
}

/** Registry listing is an internal pull operation; all user surfaces enforce the
 * Inbox admin floor. Details and mutations also check the actor here.
 */
export class ContactInboxSource implements InboxSource {
  readonly sourceId: string = "contact-requests";
  readonly displayName: string = "Contact requests";
  private readonly context: ContactInboxContext;
  private readonly now: () => number;

  constructor(context: ContactInboxContext, now: () => number = Date.now) {
    this.context = context;
    this.now = now;
  }

  async list(): Promise<InboxItem[]> {
    try {
      const entities = await this.context.entityService.listEntities(
        {
          entityType: "contact-request",
          options: {
            limit: 1000,
            sortFields: [{ field: "receivedAt", direction: "desc" }],
            filter: {
              visibilityScope: "restricted",
              metadata: { status: "new" },
            },
          },
        },
        contactRequestSchema,
      );
      const now = this.now();
      return entities.flatMap((entity): InboxItem[] => {
        const { frontmatter } = contactRequestAdapter.parseContent(
          entity.content,
        );
        if (
          frontmatter.status !== "new" ||
          Date.parse(frontmatter.expiresAt) <= now
        )
          return [];
        return [
          {
            id: entity.id,
            title: "Contact request",
            summary: `Notification: ${frontmatter.notification}.`,
            receivedAt: frontmatter.receivedAt,
            urgency: "normal",
            entityRef: { entityType: "contact-request", entityId: entity.id },
            actions: [{ id: "mark-handled", label: "Done" }],
          },
        ];
      });
    } catch {
      // Inbox error reporting must not echo malformed private content or backend details.
      throw new Error("Contact inbox unavailable");
    }
  }

  async resolveDetail(
    itemId: string,
    actor: InboxActor,
    signal: AbortSignal,
  ): Promise<InboxItemDetail> {
    requireAdmin(actor);
    signal.throwIfAborted();
    try {
      const entity = await this.context.entityService.getEntity(
        {
          entityType: "contact-request",
          id: itemId,
          visibilityScope: "restricted",
        },
        contactRequestSchema,
      );
      signal.throwIfAborted();
      const { frontmatter, message } = parseRequest(entity, this.now());
      return {
        kind: "plain",
        text: `Name: ${frontmatter.name}\nEmail: ${frontmatter.email}\nNotification: ${frontmatter.notification}\n\n${message}`,
        truncated: false,
      };
    } catch {
      signal.throwIfAborted();
      throw new Error("Contact request unavailable");
    }
  }

  async act(
    itemId: string,
    actionId: string,
    actor: InboxActor,
  ): Promise<void> {
    requireAdmin(actor);
    if (actionId !== "mark-handled")
      throw new Error("Invalid contact inbox action");
    this.context.permissions.assertEntityActionAllowed(
      "contact-request",
      "update",
      { userPermissionLevel: actor.permissionLevel },
    );
    try {
      const current = await this.context.entityService.getEntity(
        {
          entityType: "contact-request",
          id: itemId,
          visibilityScope: "restricted",
        },
        contactRequestSchema,
      );
      const { entity, frontmatter, message } = parseRequest(
        current,
        this.now(),
      );
      if (frontmatter.status === "handled") return;
      const content = contactRequestAdapter.createContent(
        { ...frontmatter, status: "handled" },
        message,
      );
      const result = await this.context.entityService.updateEntity({
        entity: {
          ...entity,
          content,
          metadata: { ...entity.metadata, status: "handled" },
        },
        options: { expectedContentHash: entity.contentHash },
      });
      if (result.skipped) throw new Error("Contact request unavailable");
    } catch {
      throw new Error("Contact request unavailable");
    }
  }
}
