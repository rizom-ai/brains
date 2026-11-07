import { internalFullScope } from "@brains/plugins";
import type { ServiceEntityService } from "@brains/plugins";
import type {
  FormAlertAnswer,
  FormDeliveryTarget,
  FormNotificationState,
} from "@brains/forms";
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
  constructor(entities: ServiceEntityService) {
    this.entities = entities;
  }

  /** What the owner's alert carries: the request under the form's labels,
   * answered by replying to its sender. */
  async alert(
    id: string,
  ): Promise<{ answers: FormAlertAnswer[]; replyTo: string } | null> {
    const entity = await this.read(id);
    if (!entity) return null;
    const { frontmatter, message } = contactRequestAdapter.parseContent(
      entity.content,
    );
    return {
      answers: [
        { label: "Name", value: frontmatter.name },
        { label: "Email", value: frontmatter.email },
        { label: "Message", value: message },
      ],
      replyTo: frontmatter.email,
    };
  }

  async notification(id: string): Promise<FormNotificationState | null> {
    const entity = await this.read(id);
    return entity?.metadata.notification ?? null;
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
}
