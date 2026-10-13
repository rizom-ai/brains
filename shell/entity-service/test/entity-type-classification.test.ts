import { expect, test } from "bun:test";
import { z } from "@brains/utils/zod";
import { createSilentLogger } from "@brains/test-utils";
import { EntityRegistry } from "../src/entityRegistry";
import { entityTypeClassificationSchema } from "../src/entity-type-classification";
import { isGroupingContributor } from "../src/grouping-eligibility";
import type { EntityTypeConfig } from "../src/types";
import { noteSchema, noteAdapter } from "./helpers/test-schemas";

const adapter = { frontmatterSchema: z.object({}) };
test("content is the convention; embedding, projection and access policies do not classify types", () => {
  expect(entityTypeClassificationSchema.parse(undefined)).toBe("content");
  expect(entityTypeClassificationSchema.safeParse("machinery").success).toBe(
    false,
  );
  expect(isGroupingContributor(adapter, {})).toBe(true);
  expect(
    isGroupingContributor(adapter, {
      embeddable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
      actionPolicy: { update: "admin" },
    }),
  ).toBe(true);
  expect(isGroupingContributor(adapter, { classification: "system" })).toBe(
    false,
  );
  expect(isGroupingContributor(adapter, { binaryStorage: "asset" })).toBe(
    false,
  );
  expect(isGroupingContributor({ ...adapter, isSingleton: true }, {})).toBe(
    false,
  );
  expect(isGroupingContributor({}, {})).toBe(false);
});
test("registration validates classification atomically and snapshots plugin intent", () => {
  const registry = EntityRegistry.createFresh(createSilentLogger());
  const config: EntityTypeConfig = { classification: "system" };
  Reflect.set(config, "classification", "invalid");
  expect(() =>
    registry.registerEntityType("note", noteSchema, noteAdapter, config),
  ).toThrow();
  expect(registry.hasEntityType("note")).toBe(false);
  config.classification = "system";
  registry.registerEntityType("note", noteSchema, noteAdapter, config);
  config.classification = "content";
  registry.getEntityTypeConfig("note").classification = "content";
  expect(registry.getEntityTypeConfig("note").classification).toBe("system");
  expect(() =>
    registry.registerGrouping({
      key: "clients",
      field: "clients",
      label: "Clients",
      types: ["note"],
    }),
  ).toThrow("eligible content entity type");
  expect(
    registry.getEffectiveFrontmatterSchema("note")?.shape["clients"],
  ).toBeUndefined();
});
test("unannotated registered content types remain eligible without an allowlist", () => {
  const registry = EntityRegistry.createFresh(createSilentLogger());
  registry.registerEntityType("note", noteSchema, noteAdapter);
  expect(registry.getEntityTypeConfig("note").classification).toBe("content");
  registry.registerGrouping({
    key: "clients",
    field: "clients",
    label: "Clients",
    types: ["note"],
  });
  expect(
    registry.getEffectiveFrontmatterSchema("note")?.shape["clients"],
  ).toBeDefined();
});
