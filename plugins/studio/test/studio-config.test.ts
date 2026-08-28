import { describe, it, expect } from "bun:test";
import { z } from "@brains/utils/zod";
import { zodFieldToStudioWidget } from "../src/config";

describe("zodFieldToStudioWidget", () => {
  it("should map z.string() to string widget", () => {
    const result = zodFieldToStudioWidget("title", z.string());
    expect(result.widget).toBe("string");
    expect(result.name).toBe("title");
    expect(result.label).toBe("Title");
  });

  it("should map z.string().datetime() to datetime widget", () => {
    const result = zodFieldToStudioWidget("publishedAt", z.string().datetime());
    expect(result.widget).toBe("datetime");
    expect(result.label).toBe("Published At");
  });

  it("should map z.number() to number widget", () => {
    const result = zodFieldToStudioWidget("year", z.number());
    expect(result.widget).toBe("number");
  });

  it("should map z.boolean() to boolean widget", () => {
    const result = zodFieldToStudioWidget("featured", z.boolean());
    expect(result.widget).toBe("boolean");
  });

  it("should map z.enum() to select widget with options", () => {
    const result = zodFieldToStudioWidget(
      "status",
      z.enum(["draft", "published"]),
    );
    expect(result.widget).toBe("select");
    expect(result.options).toEqual(["draft", "published"]);
  });

  it("should unwrap a preprocess/pipe around an enum to a select widget", () => {
    const result = zodFieldToStudioWidget(
      "kind",
      z.preprocess(
        (value) => value,
        z.enum(["person", "team", "organization"]),
      ),
    );
    expect(result.widget).toBe("select");
    expect(result.options).toEqual(["person", "team", "organization"]);
  });

  it("should unwrap .optional() and set required: false", () => {
    const result = zodFieldToStudioWidget("slug", z.string().optional());
    expect(result.widget).toBe("string");
    expect(result.required).toBe(false);
  });

  it("should preserve Studio field conditions from schema metadata", () => {
    const result = zodFieldToStudioWidget(
      "role",
      z
        .string()
        .optional()
        .meta({ studioCondition: { field: "kind", value: "person" } }),
    );

    expect(result.condition).toEqual({ field: "kind", value: "person" });
  });

  it("should map image-entity reference fields to the image widget", () => {
    // Image references are string ids into the image entity type, named by
    // the <role>ImageId convention (coverImageId, ogImageId, ...).
    expect(
      zodFieldToStudioWidget("coverImageId", z.string().optional()).widget,
    ).toBe("image");
    expect(
      zodFieldToStudioWidget("ogImageId", z.string().optional()).widget,
    ).toBe("image");
    expect(zodFieldToStudioWidget("imageId", z.string()).widget).toBe("image");
    // Not references: no ImageId suffix.
    expect(zodFieldToStudioWidget("imageIdea", z.string()).widget).toBe(
      "string",
    );
  });
});
