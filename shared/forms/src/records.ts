import { internalFullScope } from "@brains/plugins";
import type { BaseEntity, ServiceEntityService } from "@brains/plugins";
import type { FormAlertAnswer } from "./alert";
import type { FormDefinition } from "./definition";
import type { FormDeliveryTarget, FormNotificationState } from "./delivery";
import type { FormTarget } from "./target";

/** A target's records as the engine reads and updates them. */
export class FormRecords<
  E extends BaseEntity = BaseEntity,
> implements FormDeliveryTarget {
  private readonly entities: ServiceEntityService;
  readonly target: FormTarget<E>;
  constructor(entities: ServiceEntityService, target: FormTarget<E>) {
    this.entities = entities;
    this.target = target;
  }

  read(id: string): Promise<E | null> {
    return this.entities.getEntity(
      {
        entityType: this.target.entityType,
        id,
        visibilityScope: internalFullScope(
          "form intake and delivery bookkeeping",
        ),
      },
      this.target.schema,
    );
  }

  async notification(id: string): Promise<FormNotificationState | null> {
    const entity = await this.read(id);
    return entity ? this.target.notification(entity) : null;
  }

  /** Retried on a concurrent edit, such as the owner marking it done. */
  async recordNotification(
    id: string,
    notification: "sent" | "failed",
    signal: AbortSignal,
    attempts = 4,
  ): Promise<void> {
    if (attempts === 0) throw new Error("Form notification unavailable");
    signal.throwIfAborted();
    const entity = await this.read(id);
    if (!entity) return;
    const current = this.target.notification(entity);
    if (current === notification || current === "sent") return;
    const result = await this.entities.updateEntity({
      entity: {
        ...entity,
        ...this.target.withNotification(entity, notification),
      },
      options: { expectedContentHash: entity.contentHash, signal },
    });
    if (result.skipped)
      await this.recordNotification(id, notification, signal, attempts - 1);
  }

  async alert(
    id: string,
    form: FormDefinition,
  ): Promise<{
    answers: FormAlertAnswer[];
    replyTo?: string | undefined;
  } | null> {
    const entity = await this.read(id);
    return entity ? this.target.alert(entity, form) : null;
  }

  async handled(id: string): Promise<boolean | null> {
    const entity = await this.read(id);
    return entity ? this.target.handled(entity) : null;
  }
}
