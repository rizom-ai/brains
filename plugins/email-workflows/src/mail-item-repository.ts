import { internalFullScope } from "@brains/plugins";
import type { EmailEntityService } from "./lib/email-context";
import { mailItemSchema } from "./entity/schemas/mail-item";
import type { MailItemProjection } from "./lib/mail-item-projection";
import type { MailItemRepository } from "./triage-processor";

export class EntityMailItemRepository implements MailItemRepository {
  private readonly entityService: EmailEntityService;

  constructor(entityService: EmailEntityService) {
    this.entityService = entityService;
  }

  async get(id: string): Promise<{ id: string } | null> {
    const entity = await this.entityService.getEntity(
      {
        entityType: "mail-item",
        id,
        visibilityScope: internalFullScope("mail ingestion dedupe check"),
      },
      mailItemSchema,
    );
    return entity ? { id: entity.id } : null;
  }

  async create(projection: MailItemProjection): Promise<void> {
    await this.entityService.createEntity({ entity: projection });
  }
}
