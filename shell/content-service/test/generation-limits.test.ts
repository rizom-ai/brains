import { describe, expect, test } from "bun:test";
import type { JsonObject, JsonValue } from "@brains/contracts";
import {
  MAX_GENERATION_REQUEST_BYTES,
  MAX_GENERATION_TARGETS,
  MAX_GENERATION_JSON_DEPTH,
  GenerationLimitError,
  assertGenerationJsonLimits,
  assertGenerationRequestLimits,
} from "../src/generation-limits";
import {
  contentGenerationRequestSchema,
  contentGenerationJobDataSchema,
} from "../src/generation-contracts";

const target = {
  templateName: "books:chapter",
  destination: {
    entityType: "book-section",
    idPath: ["chapter"],
    metadata: {},
  },
};

describe("generation request budgets", () => {
  test("counts targets before inspecting their contents", () => {
    const targets = Array.from(
      { length: MAX_GENERATION_TARGETS },
      () => target,
    );
    expect(() => assertGenerationRequestLimits({ targets })).not.toThrow();
    expect(() =>
      assertGenerationRequestLimits({ targets: [...targets, target] }),
    ).toThrow(GenerationLimitError);
  });

  test.each([
    { unicode: "🙂é\ud800", escaped: '\u0000\n\t"\\' },
    { nested: [true, false, null, 12.5, -10, {}, []] },
    { optional: undefined, string: "", array: [undefined] },
  ])(
    "enforces exact serialized UTF-8 size including punctuation/escapes",
    (sample) => {
      const value = { sample, padding: "" };
      const overhead = Buffer.byteLength(JSON.stringify(value), "utf8");
      value.padding = "x".repeat(MAX_GENERATION_REQUEST_BYTES - overhead);
      expect(() => assertGenerationJsonLimits(value)).not.toThrow();
      value.padding += "x";
      expect(() => assertGenerationJsonLimits(value)).toThrow(
        GenerationLimitError,
      );
    },
  );

  test("counts repeated object references repeatedly but rejects cycles", () => {
    const shared = { text: "x".repeat(MAX_GENERATION_REQUEST_BYTES / 2 - 50) };
    expect(() => assertGenerationJsonLimits([shared, shared])).not.toThrow();
    expect(() => assertGenerationJsonLimits([shared, shared, shared])).toThrow(
      GenerationLimitError,
    );
    const cycle: JsonObject = {};
    cycle["self"] = cycle;
    expect(() => assertGenerationJsonLimits(cycle)).toThrow("circular");
    expect(
      contentGenerationRequestSchema.safeParse({
        targets: [{ ...target, context: { data: cycle } }],
      }).success,
    ).toBe(false);
    expect(
      contentGenerationJobDataSchema.safeParse({ context: cycle }).success,
    ).toBe(false);
  });

  test("accepts the depth boundary and rejects the next level", () => {
    let value: JsonValue = 0;
    for (let i = 0; i < MAX_GENERATION_JSON_DEPTH; i++)
      value = { nested: value };
    expect(() => assertGenerationJsonLimits(value)).not.toThrow();
    expect(() => assertGenerationJsonLimits({ nested: value })).toThrow(
      GenerationLimitError,
    );
  });

  test("rejects deep input before recursive schema validation", () => {
    let data: JsonObject = {};
    for (let i = 0; i < 10_000; i++) data = { nested: data };
    expect(() => assertGenerationJsonLimits(data)).toThrow(
      `JSON depth ${MAX_GENERATION_JSON_DEPTH}`,
    );
    expect(
      contentGenerationRequestSchema.safeParse({
        targets: [{ ...target, context: { data } }],
      }).success,
    ).toBe(false);
  });

  test("request size is aggregate, not just a per-target ceiling", () => {
    const one = {
      ...target,
      context: { prompt: "é".repeat(MAX_GENERATION_REQUEST_BYTES / 4) },
    };
    expect(() =>
      assertGenerationRequestLimits({ targets: [one] }),
    ).not.toThrow();
    expect(() =>
      assertGenerationRequestLimits({ targets: [one, one] }),
    ).toThrow(GenerationLimitError);
  });
});
