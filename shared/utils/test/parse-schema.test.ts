import { describe, it, expect } from "bun:test";
import { z } from "../src/zod";
import { parseWithSchema, safeParseWithSchema } from "../src/parse-schema";

const pointSchema = z.object({ x: z.number(), y: z.number() });

/** Stands in for a generically-constrained schema parameter. */
function parseThroughGeneric<S extends z.ZodType<unknown, unknown>>(
  schema: S,
  value: unknown,
): z.output<S> {
  return parseWithSchema(schema, value);
}

describe("parseWithSchema", () => {
  it("returns the schema's output type for a concrete schema", () => {
    const point = parseWithSchema(pointSchema, { x: 1, y: 2 });
    expect(point.x).toBe(1);
    expect(point.y).toBe(2);
  });

  it("recovers the output type through a generic schema parameter", () => {
    const point = parseThroughGeneric(pointSchema, { x: 3, y: 4 });
    expect(point.x).toBe(3);
  });

  it("applies schema transforms rather than passing input through", () => {
    const trimmed = z.string().transform((value) => value.trim());
    expect(parseWithSchema(trimmed, "  a  ")).toBe("a");
  });

  it("throws when the value does not match", () => {
    expect(() => parseWithSchema(pointSchema, { x: 1 })).toThrow();
    expect(() => parseWithSchema(pointSchema, null)).toThrow();
  });
});

describe("safeParseWithSchema", () => {
  it("reports success with the parsed data", () => {
    const result = safeParseWithSchema(pointSchema, { x: 1, y: 2 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.x).toBe(1);
  });

  it("reports failure without throwing", () => {
    const result = safeParseWithSchema(pointSchema, { x: 1 });
    expect(result.success).toBe(false);
  });
});
