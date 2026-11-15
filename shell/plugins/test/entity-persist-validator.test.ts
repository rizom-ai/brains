import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  withPersistValidator,
  type AnyEntityDefinition,
} from "../src";

/**
 * A first-party type whose class checked a write against the record's id as
 * well as its document checks it the same way: the form type refuses a form
 * whose id is not a slug, before it is stored. A definition that also
 * declares the public validatePersist is refused: one type, one check.
 */

const seen: { id: string; content: string; visibility: string }[] = [];

const form = withPersistValidator(
  defineEntity({
    type: "form",
    purpose: "A public form.",
    metadata: z.object({ title: z.string() }),
  }),
  async (entity) => {
    seen.push({ ...entity });
    if (!/^[a-z0-9-]+$/.test(entity.id)) throw new Error("Invalid form");
  },
);

async function validatorOf(
  definition: AnyEntityDefinition,
): Promise<
  NonNullable<
    ReturnType<
      ReturnType<
        ReturnType<typeof createPluginHarness>["getEntityRegistry"]
      >["getPersistValidator"]
    >
  >
> {
  const harness = createPluginHarness({
    logger: createSilentLogger("entity-persist-validator"),
  });
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "forms", entities: [definition] }),
    {},
    { name: "@fixture/forms", version: "0.1.0" },
  )) {
    await harness.installPlugin(plugin);
  }
  const validator = harness.getEntityRegistry().getPersistValidator("form");
  if (!validator) throw new Error("No persist validator");
  return validator;
}

const entity = {
  id: "work-with-us",
  entityType: "form",
  content: "---\ntitle: Work with us\n---\nIntro.\n",
  contentHash: "hash",
  visibility: "public" as const,
  created: "2026-11-07T10:00:00.000Z",
  updated: "2026-11-07T10:00:00.000Z",
  metadata: { title: "Work with us" },
};

describe("a first-party type's persist check that reads the record's id", () => {
  it("checks every write with the record's id, document and visibility", async () => {
    const validator = await validatorOf(form);
    seen.length = 0;
    expect(await validator(entity, { operation: "create" })).toBeUndefined();
    expect(seen).toEqual([
      {
        id: "work-with-us",
        content: entity.content,
        visibility: "public",
      },
    ]);
  });

  it("refuses a write whose id the check refuses", async () => {
    const validator = await validatorOf(form);
    expect(
      validator({ ...entity, id: "Work With Us" }, { operation: "update" }),
    ).rejects.toThrow("Invalid form");
  });

  it("refuses a definition that also declares the public check", () => {
    expect(() =>
      withPersistValidator(
        defineEntity({
          type: "form",
          purpose: "A public form.",
          metadata: z.object({ title: z.string() }),
          validatePersist: () => undefined,
        }),
        () => undefined,
      ),
    ).toThrow('Entity "form" already declares a persist check');
  });
});
