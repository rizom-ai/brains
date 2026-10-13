import { describe, expect, test } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { EntityRegistry } from "../src/entityRegistry";
import {
  imageAdapter,
  imageSchema,
  minimalTestAdapter,
  minimalTestSchema,
  postAdapter,
  postSchema,
  reuseAdapter,
  reuseSchema,
} from "./helpers/test-schemas";

const clients = {
  key: "clients",
  label: "Clients",
  field: "clients",
  types: ["test", "post"],
};
const areas = { key: "areas", label: "Areas", field: "areas", types: ["test"] };

function registry(): EntityRegistry {
  const value = EntityRegistry.createFresh(createSilentLogger());
  value.registerEntityType("test", minimalTestSchema, minimalTestAdapter);
  value.registerEntityType("post", postSchema, postAdapter);
  value.registerEntityType("reuse", reuseSchema, reuseAdapter);
  value.registerEntityType("image", imageSchema, imageAdapter, {
    binaryStorage: "asset",
  });
  return value;
}

describe("runtime grouping replacement", () => {
  test("adds and removes grouping-owned fields without changing the owner adapter", () => {
    const value = registry();
    value.replaceGroupings([clients]);
    expect(value.getGroupings()).toEqual([clients]);
    expect(value.getAdapter("test").frontmatterSchema?.shape).toHaveProperty(
      "clients",
    );
    expect(minimalTestAdapter.frontmatterSchema.shape).not.toHaveProperty(
      "clients",
    );
    expect(value.groupingFields("post")).toEqual(["clients"]);

    value.replaceGroupings([]);
    expect(value.getGroupings()).toEqual([]);
    expect(value.getFrontmatterExtensions("test")).toEqual([]);
    expect(
      value.getEffectiveFrontmatterSchema("test")?.shape,
    ).not.toHaveProperty("clients");
    expect(value.getAdapter("test")).toBe(minimalTestAdapter);
    expect(value.isGroupingContributor("post")).toBe(false);
  });

  test("keeps permanent plugin fields and object refinements after clearing groupings", () => {
    const value = registry();
    const extension = z
      .object({
        clients: z.array(z.enum(["Acme", "Beta"])),
        region: z.string().optional(),
      })
      .refine((fields) => fields.clients.length === 1, {
        message: "Choose one client",
      });
    value.extendFrontmatterSchema("test", extension);
    value.replaceGroupings([clients, areas]);
    expect(
      value
        .getEffectiveFrontmatterSchema("test")
        ?.safeParse({ clients: ["Acme", "Beta"] }).success,
    ).toBe(false);

    value.replaceGroupings([]);
    expect(value.getFrontmatterExtensions("test")).toEqual([extension]);
    const schema = value.getEffectiveFrontmatterSchema("test");
    expect(schema?.shape).toHaveProperty("clients");
    expect(schema?.shape).toHaveProperty("region");
    expect(schema?.shape).not.toHaveProperty("areas");
    expect(schema?.safeParse({ clients: ["Acme"] }).success).toBe(true);
    expect(schema?.safeParse({ clients: ["Gamma"] }).success).toBe(false);
    expect(schema?.safeParse({ clients: ["Acme", "Beta"] }).success).toBe(
      false,
    );
    expect(
      value.projectMetadata("test", "---\nclients: [Acme]\n---\nBody", {}),
    ).toEqual({ clients: ["Acme"] });
  });

  test("keeps a plugin extension registered after its grouping, including a shared field", () => {
    const value = registry();
    value.replaceGroupings([clients]);
    const field = value.getEffectiveFrontmatterSchema("test")?.shape["clients"];
    if (!field) throw new Error("Missing grouping field");
    const extension = z.object({
      clients: field,
      pluginField: z.string().optional(),
    });
    value.extendFrontmatterSchema("test", extension);
    value.replaceGroupings([]);
    expect(value.getFrontmatterExtensions("test")).toEqual([extension]);
    expect(value.getEffectiveFrontmatterSchema("test")?.shape).toHaveProperty(
      "clients",
    );
    expect(value.getEffectiveFrontmatterSchema("test")?.shape).toHaveProperty(
      "pluginField",
    );
    expect(
      value.getEffectiveFrontmatterSchema("post")?.shape,
    ).not.toHaveProperty("clients");
  });

  test("keeps an owner-declared field after its grouping is removed", () => {
    const value = registry();
    value.replaceGroupings([{ ...clients, types: ["reuse"] }]);
    value.replaceGroupings([]);
    expect(value.getAdapter("reuse")).toBe(reuseAdapter);
    expect(value.getEffectiveFrontmatterSchema("reuse")?.shape).toHaveProperty(
      "clients",
    );
    expect(value.getFrontmatterExtensions("reuse")).toEqual([]);
  });

  test("replaces contributor sets and labels without leaking old fields", () => {
    const value = registry();
    value.replaceGroupings([clients]);
    const next = { ...clients, label: "Customers", types: ["post"] };
    value.replaceGroupings([next, areas]);
    expect(value.getGroupings()).toEqual([next, areas]);
    expect(
      value.getEffectiveFrontmatterSchema("test")?.shape,
    ).not.toHaveProperty("clients");
    expect(value.groupingFields("test")).toEqual(["areas"]);
    expect(value.groupingFields("post")).toEqual(["clients"]);
    expect(
      value.projectMetadata(
        "test",
        "---\nclients: [Acme]\nareas: [Research]\n---\nBody",
        {},
      ),
    ).toEqual({ areas: ["Research"] });
  });

  test.each([
    ["unknown type", { ...areas, types: ["test", "missing"] }],
    ["reserved field", { ...areas, field: "visibility" }],
    ["owner scalar", { ...areas, field: "status", types: ["post"] }],
    ["metadata conflict", { ...areas, field: "category", types: ["post"] }],
    ["asset contributor", { ...areas, types: ["image"] }],
  ])(
    "a failed replacement with %s leaves the complete active set unchanged",
    (_name, invalid) => {
      const value = registry();
      value.replaceGroupings([clients]);
      const extensions = value.getFrontmatterExtensions("test");
      const next = {
        key: "projects",
        label: "Projects",
        field: "projects",
        types: ["test"],
      };
      expect(() => value.replaceGroupings([next, invalid])).toThrow();
      expect(value.getGroupings()).toEqual([clients]);
      expect(value.getFrontmatterExtensions("test")).toEqual(extensions);
      expect(
        value.getEffectiveFrontmatterSchema("test")?.shape,
      ).not.toHaveProperty("projects");
      expect(
        value.getEffectiveFrontmatterSchema("test")?.shape,
      ).not.toHaveProperty("areas");
      expect(
        value.projectMetadata("test", "---\nclients: [Acme]\n---\nBody", {}),
      ).toEqual({ clients: ["Acme"] });
    },
  );

  test("preflights complete replacements without publishing them or accumulating fields", () => {
    const value = registry();
    value.replaceGroupings([clients]);
    value.validateGroupings([clients, areas]);
    expect(value.getGroupings()).toEqual([clients]);
    expect(
      value.getEffectiveFrontmatterSchema("test")?.shape,
    ).not.toHaveProperty("areas");
    expect(() => value.replaceGroupings([areas, areas])).toThrow(
      "Duplicate entity grouping",
    );
    for (let index = 0; index < 3; index += 1)
      value.replaceGroupings([clients]);
    expect(value.getFrontmatterExtensions("test")).toHaveLength(1);
    expect(value.getFrontmatterExtensions("post")).toHaveLength(1);
  });

  test("shares generated fields only while at least one grouping needs them", () => {
    const value = registry();
    const other = { ...clients, key: "accounts", label: "Accounts" };
    value.replaceGroupings([clients, other]);
    expect(value.getFrontmatterExtensions("test")).toHaveLength(1);
    value.replaceGroupings([other]);
    expect(value.getEffectiveFrontmatterSchema("test")?.shape).toHaveProperty(
      "clients",
    );
    value.replaceGroupings([]);
    expect(
      value.getEffectiveFrontmatterSchema("test")?.shape,
    ).not.toHaveProperty("clients");
  });

  test("does not allow caller mutation to alter the installed grouping set", () => {
    const value = registry();
    const input = { ...areas, types: ["test"] };
    value.replaceGroupings([input]);
    input.types.push("post");
    const descriptor = value.getGroupings()[0];
    if (!descriptor) throw new Error("Missing grouping");
    descriptor.types.push("reuse");
    descriptor.label = "Changed";
    expect(value.getGrouping("areas")).toEqual(areas);
    expect(value.isGroupingContributor("post")).toBe(false);
  });

  test("clears grouping extensions when a type is unregistered", () => {
    const value = registry();
    value.replaceGroupings([areas]);
    value.unregisterEntityType("test");
    value.registerEntityType("test", minimalTestSchema, minimalTestAdapter);
    expect(value.getFrontmatterExtensions("test")).toEqual([]);
    expect(
      value.getEffectiveFrontmatterSchema("test")?.shape,
    ).not.toHaveProperty("areas");
  });
});
