import type { ServiceEntityService } from "@brains/plugins";
import { mailItemSchema } from "./entity/schemas/mail-item";
import type { MailItemProjection } from "./lib/mail-item-projection";
import type { MailItemRepository } from "./triage-processor";

export class EntityMailItemRepository implements MailItemRepository {
  private readonly entityService: ServiceEntityService;

  constructor(entityService: ServiceEntityService) {
    this.entityService = entityService;
  }

  async get(id: string): Promise<{ id: string } | null> {
    const entity = await this.entityService.getEntity(
      {
        entityType: "mail-item",
        id,
      },
      mailItemSchema,
    );
    return entity ? { id: entity.id } : null;
  }

  async create(projection: MailItemProjection): Promise<void> {
    await this.entityService.createEntity({ entity: projection });
  }
}
