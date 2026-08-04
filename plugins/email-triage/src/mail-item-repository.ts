import type { IEntityService } from "@brains/plugins";
import type { MailItemEntity } from "./entity/schemas/mail-item";
import type { MailItemProjection } from "./lib/mail-item-projection";
import type { MailItemRepository } from "./triage-processor";

export class EntityMailItemRepository implements MailItemRepository {
  private readonly entityService: IEntityService;

  constructor(entityService: IEntityService) {
    this.entityService = entityService;
  }

  async get(id: string): Promise<{ id: string } | null> {
    const entity = await this.entityService.getEntity<MailItemEntity>({
      entityType: "mail-item",
      id,
    });
    return entity ? { id: entity.id } : null;
  }

  async create(projection: MailItemProjection): Promise<void> {
    await this.entityService.createEntity({ entity: projection });
  }
}
