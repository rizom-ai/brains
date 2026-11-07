import { internalFullScope } from "@brains/plugins";
import type { ServiceEntityService } from "@brains/plugins";
import type { FormDeliveryTarget, FormNotificationState } from "@brains/forms";
import { contactRequestAdapter } from "./entity/adapter";
import {
  contactMetadataSchema,
  contactRequestSchema,
  type ContactRequest,
} from "./entity/schema";

/** Contact requests as the delivery engine sees them: their notification
 * state, recorded on the request contact owns. */
export class ContactDeliveryTarget implements FormDeliveryTarget {
  private readonly entities: ServiceEntityService;
  private readonly now: () => number;
  constructor(entities: ServiceEntityService, now: () => number = Date.now) {
    this.entities = entities;
    this.now = now;
  }

  async notification(id: string): Promise<FormNotificationState | null> {
    const entity = await this.read(id);
    if (!entity || this.expired(entity)) return null;
    return entity.metadata.notification;
  }

  async recordNotification(
    id: string,
    notification: "sent" | "failed",
    signal: AbortSignal,
  ): Promise<void> {
    for (let attempt = 0; attempt < 4; attempt++) {
      signal.throwIfAborted();
      const entity = await this.read(id);
      if (
        !entity ||
        this.expired(entity) ||
        entity.metadata.notification === notification ||
        entity.metadata.notification === "sent"
      )
        return;
      const { frontmatter, message } = contactRequestAdapter.parseContent(
        entity.content,
      );
      const content = contactRequestAdapter.createContent(
        { ...frontmatter, notification },
        message,
      );
      const result = await this.entities.updateEntity({
        entity: {
          ...entity,
          content,
          metadata: contactMetadataSchema.parse({
            ...entity.metadata,
            notification,
          }),
        },
        options: { expectedContentHash: entity.contentHash, signal },
      });
      if (!result.skipped) return;
    }
    throw new Error("Contact notification unavailable");
  }

  private read(id: string): Promise<ContactRequest | null> {
    return this.entities.getEntity(
      {
        entityType: "contact-request",
        id,
        visibilityScope: internalFullScope(
          "contact notification delivery bookkeeping",
        ),
      },
      contactRequestSchema,
    );
  }

  private expired(entity: ContactRequest): boolean {
    return this.now() >= Date.parse(entity.metadata.expiresAt);
  }
}
