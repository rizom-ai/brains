import { expect, it } from "bun:test";
import { copyEntityTypeConfig } from "../src/entity-type-config";
import type { EntityTypeConfig } from "../src/types";

it("preserves and detaches a type's action policy floor", () => {
  const config: EntityTypeConfig = {
    actionPolicy: { create: "admin", update: "admin", publish: "never" },
  };
  const copied = copyEntityTypeConfig(config);
  if (!config.actionPolicy || !copied.actionPolicy)
    throw new Error("Missing policy");
  config.actionPolicy.update = "public";
  expect(copied.actionPolicy).toEqual({
    create: "admin",
    update: "admin",
    publish: "never",
  });
  copied.actionPolicy.create = "trusted";
  expect(config.actionPolicy.create).toBe("admin");
});

it("rejects invalid action policy levels instead of silently dropping the floor", () => {
  expect(() =>
    Reflect.apply(copyEntityTypeConfig, undefined, [
      { actionPolicy: { update: "guest" } },
    ]),
  ).toThrow();
});
