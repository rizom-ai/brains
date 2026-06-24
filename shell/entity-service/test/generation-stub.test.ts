import { describe, expect, test } from "bun:test";
import type { z } from "@brains/utils/zod";
import {
  buildGenerationStubEntity,
  type GenerationStubAdapterLookup,
} from "../src/generation-stub";
import type { BaseEntity, EntityAdapter } from "../src/types";
import { baseEntitySchema } from "../src/types";

function makeAdapter(
  overrides: Partial<EntityAdapter<BaseEntity>> = {},
): EntityAdapter<BaseEntity> {
  return {
    entityType: "stub-note",
    schema: baseEntitySchema as z.ZodType<BaseEntity, z.ZodTypeDef, unknown>,
    toMarkdown: () => "",
    fromMarkdown: () => ({}),
    extractMetadata: () => ({}),
    parseFrontMatter: <TFrontmatter>(
      _markdown: string,
      schema: z.ZodSchema<TFrontmatter>,
    ): TFrontmatter => schema.parse({}),
    generateFrontMatter: () => "",
    getBodyTemplate: () => "",
    ...overrides,
  };
}

function makeRegistry(
  adapter: EntityAdapter<BaseEntity>,
): GenerationStubAdapterLookup {
  return { getAdapter: () => adapter };
}

describe("buildGenerationStubEntity", () => {
  test("returns undefined when the adapter does not support stubs", () => {
    const registry = makeRegistry(makeAdapter());

    const stub = buildGenerationStubEntity(registry, {
      entityType: "stub-note",
      id: "my-stub",
      title: "My Stub",
    });

    expect(stub).toBeUndefined();
  });

  test("stamps id, timestamps, and public visibility around adapter stub content", () => {
    const registry = makeRegistry(
      makeAdapter({
        buildStub: ({ id, title }) => ({
          content: `# ${title} (${id})`,
          metadata: { title, status: "generating" },
        }),
      }),
    );

    const before = new Date().toISOString();
    const stub = buildGenerationStubEntity(registry, {
      entityType: "stub-note",
      id: "my-stub",
      title: "My Stub",
    });
    const after = new Date().toISOString();

    expect(stub).toBeDefined();
    expect(stub).toMatchObject({
      id: "my-stub",
      entityType: "stub-note",
      content: "# My Stub (my-stub)",
      metadata: { title: "My Stub", status: "generating" },
      visibility: "public",
      contentHash: "",
    });
    expect(stub?.created).toBe(stub?.updated ?? "");
    const created = stub?.created ?? "";
    expect(created >= before).toBe(true);
    expect(created <= after).toBe(true);
  });
});
