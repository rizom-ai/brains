import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  defineEntity,
  defineEntityPackage,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
} from "../src";
import { isDeclaredEntityType } from "../src/test/declared-entity-type";

const memo = defineEntity({
  type: "memo",
  purpose: "A memo.",
  metadata: z.object({ title: z.string() }),
  actions: { delete: "admin" },
});

describe("isDeclaredEntityType", () => {
  it("finds the entity types a package installs, with what registering them takes", () => {
    const plugins = instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "memos", entities: [memo] }),
      {},
      { name: "@fixture/memos", version: "0.1.0" },
    );
    const types = plugins.filter(isDeclaredEntityType);
    expect(types.map((type) => type.entityType)).toEqual(["memo"]);
    const [type] = types;
    if (!type) throw new Error("No memo type");
    expect(type.type).toBe("entity");
    expect(
      type.schema.safeParse({
        id: "m1",
        entityType: "memo",
        content: "",
        contentHash: "h",
        created: "2026-11-13T00:00:00.000Z",
        updated: "2026-11-13T00:00:00.000Z",
        visibility: "public",
        metadata: { title: "Memo" },
      }).success,
    ).toBe(true);
    expect(type.adapter.entityType).toBe("memo");
    expect(type.entityActionPolicy).toEqual({ memo: { delete: "admin" } });
  });

  it("passes over a service, and anything that is not a plugin", () => {
    const [service] = instantiatePluginPackageDefinition(
      defineServicePlugin({
        id: "digests",
        config: z.object({}),
        setup: () => ({}),
      }),
      {},
      { name: "@fixture/digests", version: "0.1.0" },
    );
    expect(isDeclaredEntityType(service)).toBe(false);
    expect(isDeclaredEntityType({ type: "entity", entityType: "memo" })).toBe(
      false,
    );
    expect(isDeclaredEntityType(undefined)).toBe(false);
  });
});
