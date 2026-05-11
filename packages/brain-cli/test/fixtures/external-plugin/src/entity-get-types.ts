import type {
  IEntityService,
  ServicePluginContext,
} from "@rizom/brain/plugins";
import type { BaseEntity } from "@rizom/brain/entities";

interface GetFixtureEntity extends BaseEntity<{ title: string }> {
  entityType: "get-fixture";
  metadata: { title: string };
}

export async function assertGetEntityShape(
  context: ServicePluginContext,
): Promise<GetFixtureEntity | null> {
  const entityService: IEntityService = context.entityService;
  const entity = await entityService.getEntity<GetFixtureEntity>({
    entityType: "get-fixture",
    id: "example",
  });

  const content: string | undefined = entity?.content;
  void content;

  return entity;
}
