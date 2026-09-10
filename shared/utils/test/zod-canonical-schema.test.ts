import { describe, expect, it } from "bun:test";
import { z } from "../src/zod";
import { findSchemaTransformation } from "../src/zod-introspect";

describe("schema transformation inspection", () => {
  it("finds rewriting nodes through containers, wrappers, branches, and lazy references", () => {
    const rewrite = z.string().transform((value) => `prefix:${value}`);
    const schemas = [
      rewrite,
      z.string().pipe(z.coerce.number()),
      z.preprocess(Number, z.number()),
      z.codec(z.string(), z.number(), { decode: Number, encode: String }),
      z.string().overwrite((value) => `prefix:${value}`),
      z.string().trim(),
      rewrite.optional(),
      rewrite.nullable(),
      rewrite.optional().nonoptional(),
      rewrite.default("fallback"),
      rewrite.prefault("fallback"),
      rewrite.catch("fallback"),
      rewrite.readonly(),
      z.array(rewrite),
      z.object({ nested: rewrite }),
      z.object({}).catchall(rewrite),
      z.record(z.string(), rewrite),
      z.record(rewrite, z.string()),
      z.union([z.string(), rewrite]),
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("a"), value: rewrite }),
        z.object({ kind: z.literal("b") }),
      ]),
      z.intersection(
        z.object({ value: rewrite }),
        z.object({ other: z.string() }),
      ),
      z.tuple([z.string(), rewrite]),
      z.tuple([z.string()]).rest(rewrite),
      z.lazy(() => rewrite),
      z.map(z.string(), rewrite),
      z.set(rewrite),
      z.promise(rewrite),
      z.success(z.string()),
    ];
    for (const schema of schemas) {
      expect(findSchemaTransformation(schema), schema.def.type).toBeDefined();
    }
    expect(
      findSchemaTransformation(
        z.object({ values: z.array(rewrite) }),
        "metadata",
      ),
    ).toEqual({ path: "metadata.values[]", kind: "pipe" });
  });

  it("allows validation, defaults, coercion, and cycles without executing defaults or refinements", () => {
    let calls = 0;
    const recursive: z.ZodType = z.lazy(() =>
      z.object({ children: z.array(recursive) }),
    );
    const schema = z.object({
      priority: z.coerce.number().min(0),
      done: z.boolean().default(() => {
        calls++;
        return false;
      }),
      name: z.string().refine(() => {
        calls++;
        return true;
      }),
      optional: z.string().optional(),
      choice: z.union([z.literal("a"), z.literal("b")]),
      recursive,
    });
    expect(findSchemaTransformation(schema)).toBeUndefined();
    expect(calls).toBe(0);
    const withCycle: z.ZodType = z.lazy(() =>
      z.object({
        children: z.array(withCycle),
        value: z.string().transform(Number),
      }),
    );
    expect(findSchemaTransformation(withCycle)).toEqual({
      path: "schema.value",
      kind: "pipe",
    });
  });
});
