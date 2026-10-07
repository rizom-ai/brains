import { expect, test } from "bun:test";
import { createEvalFixtures } from "../src/entity/eval-fixtures";
import { createMockEntityService } from "../src/test/mock-entity-service";
import { createMockEntityStore } from "../src/test/mock-entity-store";

test("explicitly private eval seeds never become public and remain resettable", async () => {
  const service = createMockEntityService(createMockEntityStore());
  const fixtures = createEvalFixtures(service, ["owned"], async () => {});
  await fixtures.seed({
    entityType: "owned",
    id: "private",
    content: "Private evaluation example",
    visibility: "restricted",
  });
  expect(
    await service.getEntity({
      entityType: "owned",
      id: "private",
      visibilityScope: "public",
    }),
  ).toBeNull();
  expect(
    (
      await service.getEntity({
        entityType: "owned",
        id: "private",
        visibilityScope: "restricted",
      })
    )?.visibility,
  ).toBe("restricted");
  await fixtures.reset();
  expect(
    await service.getEntity({
      entityType: "owned",
      id: "private",
      visibilityScope: "restricted",
    }),
  ).toBeNull();
});

test("reset defaults to public and widens only explicitly, never deleting unrelated types", async () => {
  const service = createMockEntityService(createMockEntityStore());
  const fixtures = createEvalFixtures(service, ["owned"], async () => {});
  for (const entityType of ["owned", "other"])
    for (const visibility of ["public", "restricted"] as const)
      await service.createEntity({
        entity: {
          entityType,
          id: `${entityType}-${visibility}`,
          content: "Existing",
          visibility,
          metadata: {},
        },
      });
  await fixtures.reset();
  expect(
    await service.getEntity({ entityType: "owned", id: "owned-public" }),
  ).toBeNull();
  expect(
    await service.getEntity({
      entityType: "owned",
      id: "owned-restricted",
      visibilityScope: "restricted",
    }),
  ).not.toBeNull();
  await fixtures.reset({ visibilityScope: "restricted" });
  expect(
    await service.getEntity({
      entityType: "owned",
      id: "owned-restricted",
      visibilityScope: "restricted",
    }),
  ).toBeNull();
  expect(
    (
      await service.listEntities({
        entityType: "other",
        options: { filter: { visibilityScope: "restricted" } },
      })
    )
      .map((entity) => entity.id)
      .sort(),
  ).toEqual(["other-public", "other-restricted"]);
});
