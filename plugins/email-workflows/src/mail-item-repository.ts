import type { EntityAccess } from "@brains/sdk/entities";
import { mailItemSchema, mailItemReference } from "./entity/schemas/mail-item";
import type { MailItemProjection } from "./lib/mail-item-projection";
import type { MailItemRepository } from "./triage-processor";

/** Mail items as the triage job may touch them: read one, write one. */
export class EntityMailItemRepository implements MailItemRepository {
  private readonly entities: Pick<EntityAccess, "getEntity" | "create">;

  constructor(entities: Pick<EntityAccess, "getEntity" | "create">) {
    this.entities = entities;
  }

  async get(id: string): Promise<{ id: string } | null> {
    const entity = await this.entities.getEntity(
      { entityType: "mail-item", id, visibilityScope: "restricted" },
      mailItemSchema,
    );
    return entity ? { id: entity.id } : null;
  }

  async create(projection: MailItemProjection): Promise<void> {
    await this.entities.create(mailItemReference, projection);
  }
}
