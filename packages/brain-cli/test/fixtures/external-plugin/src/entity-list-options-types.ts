import type { ServicePluginContext } from "@rizom/brain/plugins";
import type { BaseEntity, ListOptions } from "@rizom/brain/entities";

interface ListFixtureEntity extends BaseEntity<{ title: string }> {
  entityType: "list-fixture";
  metadata: { title: string };
}

type Assert<T extends true> = T;
type ListEntitiesRequest = Parameters<
  ServicePluginContext["entityService"]["listEntities"]
>[0];
type ListEntitiesOptions = NonNullable<ListEntitiesRequest["options"]>;

export type ListOptionsArePubliclyTyped = Assert<
  ListEntitiesOptions extends ListOptions ? true : false
>;

export async function assertListOptionsShape(
  context: ServicePluginContext,
): Promise<ListFixtureEntity[]> {
  const options: ListOptions = {
    limit: 10,
    offset: 0,
    publishedOnly: true,
    filter: { metadata: { title: "Example" } },
    sortFields: [{ field: "updated", direction: "desc" }],
  };

  return context.entityService.listEntities<ListFixtureEntity>({
    entityType: "list-fixture",
    options,
  });
}
