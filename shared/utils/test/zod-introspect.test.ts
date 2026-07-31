import { describe, it, expect } from "bun:test";
import { z } from "../src/zod";
import {
  getArrayElement,
  getKind,
  getObjectShape,
  hasStringFormat,
  readEnumValues,
  readLiteralValue,
  readMetadata,
  unwrapField,
} from "../src/zod-introspect";

describe("getKind", () => {
  it("returns the def kind for base schemas", () => {
    expect(getKind(z.string())).toBe("string");
    expect(getKind(z.number())).toBe("number");
    expect(getKind(z.boolean())).toBe("boolean");
    expect(getKind(z.array(z.string()))).toBe("array");
    expect(getKind(z.date())).toBe("date");
    expect(getKind(z.enum(["a", "b"]))).toBe("enum");
    expect(getKind(z.literal("post"))).toBe("literal");
    expect(getKind(z.object({}))).toBe("object");
  });

  it("returns the wrapper kind for wrapped schemas", () => {
    expect(getKind(z.string().optional())).toBe("optional");
    expect(getKind(z.string().default("x"))).toBe("default");
  });

  it("returns undefined for non-schemas", () => {
    expect(getKind(undefined)).toBeUndefined();
    expect(getKind(null)).toBeUndefined();
    expect(getKind("string")).toBeUndefined();
    expect(getKind({ def: { type: 42 } })).toBeUndefined();
  });
});

describe("unwrapField", () => {
  it("passes through unwrapped schemas as required", () => {
    const { inner, required, defaultValue } = unwrapField(z.string());
    expect(getKind(inner)).toBe("string");
    expect(required).toBe(true);
    expect(defaultValue).toBeUndefined();
  });

  it("unwraps optional", () => {
    const { inner, required } = unwrapField(z.string().optional());
    expect(getKind(inner)).toBe("string");
    expect(required).toBe(false);
  });

  it("unwraps nullable", () => {
    const { inner, required } = unwrapField(z.string().nullable());
    expect(getKind(inner)).toBe("string");
    expect(required).toBe(false);
  });

  it("unwraps chained nullable + optional", () => {
    const { inner, required } = unwrapField(z.string().nullable().optional());
    expect(getKind(inner)).toBe("string");
    expect(required).toBe(false);
  });

  it("unwraps default and captures the default value", () => {
    const result = unwrapField(z.boolean().default(true));
    expect(getKind(result.inner)).toBe("boolean");
    expect(result.required).toBe(false);
    expect(result.defaultValue).toBe(true);
  });

  it("captures array default values", () => {
    const result = unwrapField(z.array(z.string()).default([]));
    expect(getKind(result.inner)).toBe("array");
    expect(result.required).toBe(false);
    expect(result.defaultValue).toEqual([]);
  });

  it("resolves function (factory) defaults to their value", () => {
    const result = unwrapField(z.string().default(() => "generated"));
    expect(getKind(result.inner)).toBe("string");
    expect(result.defaultValue).toBe("generated");
  });

  it("unwraps optional around default", () => {
    const result = unwrapField(z.string().default("x").optional());
    expect(getKind(result.inner)).toBe("string");
    expect(result.required).toBe(false);
    expect(result.defaultValue).toBe("x");
  });

  it("omits defaultValue when there is no default wrapper", () => {
    const result = unwrapField(z.string().optional());
    expect("defaultValue" in result).toBe(false);
  });

  it("unwraps a preprocess/pipe to its output schema", () => {
    const schema = z.preprocess(
      (value) => value,
      z.enum(["person", "team", "organization"]),
    );
    const { inner, required } = unwrapField(schema);
    expect(getKind(inner)).toBe("enum");
    expect(required).toBe(true);
    expect(readEnumValues(inner)).toEqual(["person", "team", "organization"]);
  });

  it("unwraps wrappers inside a pipe output", () => {
    const schema = z.preprocess((value) => value, z.string().optional());
    const { inner, required } = unwrapField(schema);
    expect(getKind(inner)).toBe("string");
    expect(required).toBe(false);
  });

  it("passes through non-schema values", () => {
    expect(unwrapField(undefined)).toEqual({
      inner: undefined,
      required: true,
    });
    expect(unwrapField("nope")).toEqual({ inner: "nope", required: true });
  });
});

describe("readEnumValues", () => {
  it("returns the string values of an enum schema", () => {
    expect(readEnumValues(z.enum(["draft", "queued", "published"]))).toEqual([
      "draft",
      "queued",
      "published",
    ]);
  });

  it("returns undefined for non-enum schemas and non-schemas", () => {
    expect(readEnumValues(z.string())).toBeUndefined();
    expect(readEnumValues(undefined)).toBeUndefined();
  });

  it("returns undefined when enum values are not all strings", () => {
    expect(readEnumValues(z.nativeEnum({ A: "a", B: 1 }))).toBeUndefined();
  });
});

describe("readLiteralValue", () => {
  it("returns the literal value", () => {
    expect(readLiteralValue(z.literal("post"))).toBe("post");
    expect(readLiteralValue(z.literal(42))).toBe(42);
  });

  it("returns undefined for non-literal schemas and non-schemas", () => {
    expect(readLiteralValue(z.string())).toBeUndefined();
    expect(readLiteralValue(null)).toBeUndefined();
  });
});

describe("getObjectShape", () => {
  it("returns the shape of an object schema", () => {
    const shape = getObjectShape(z.object({ title: z.string() }));
    expect(shape).toBeDefined();
    expect(Object.keys(shape ?? {})).toEqual(["title"]);
    expect(getKind(shape?.["title"])).toBe("string");
  });

  it("returns undefined for non-object schemas and non-schemas", () => {
    expect(getObjectShape(z.string())).toBeUndefined();
    expect(getObjectShape(undefined)).toBeUndefined();
  });
});

describe("getArrayElement", () => {
  it("returns the element schema of an array", () => {
    expect(getKind(getArrayElement(z.array(z.number())))).toBe("number");
  });

  it("returns undefined for non-array schemas and non-schemas", () => {
    expect(getArrayElement(z.string())).toBeUndefined();
    expect(getArrayElement(undefined)).toBeUndefined();
  });
});

describe("hasStringFormat", () => {
  it("detects a datetime check added via z.string().datetime()", () => {
    expect(hasStringFormat(z.string().datetime(), "datetime")).toBe(true);
  });

  it("detects the format of a top-level format schema (z.iso.datetime)", () => {
    expect(hasStringFormat(z.iso.datetime(), "datetime")).toBe(true);
  });

  it("does not match plain strings or other formats", () => {
    expect(hasStringFormat(z.string(), "datetime")).toBe(false);
    expect(hasStringFormat(z.string().email(), "datetime")).toBe(false);
  });

  it("returns false for non-string schemas and non-schemas", () => {
    expect(hasStringFormat(z.number(), "datetime")).toBe(false);
    expect(hasStringFormat(undefined, "datetime")).toBe(false);
  });
});

describe("readMetadata", () => {
  it("returns metadata registered via .meta()", () => {
    const schema = z
      .string()
      .optional()
      .meta({ cmsCondition: { field: "kind", value: "person" } });
    expect(readMetadata(schema)).toEqual({
      cmsCondition: { field: "kind", value: "person" },
    });
  });

  it("returns undefined when no metadata is registered", () => {
    expect(readMetadata(z.string())).toBeUndefined();
  });

  it("returns undefined for non-schemas", () => {
    expect(readMetadata(undefined)).toBeUndefined();
    expect(readMetadata({ meta: 42 })).toBeUndefined();
  });
});
