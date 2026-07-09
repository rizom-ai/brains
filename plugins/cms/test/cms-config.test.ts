import { describe, it, expect } from "bun:test";
import { z } from "@brains/utils/zod";
import { zodFieldToCmsWidget } from "../src/config";

describe("zodFieldToCmsWidget", () => {
  it("should map z.string() to string widget", () => {
    const result = zodFieldToCmsWidget("title", z.string());
    expect(result.widget).toBe("string");
    expect(result.name).toBe("title");
    expect(result.label).toBe("Title");
  });

  it("should map z.string().datetime() to datetime widget", () => {
    const result = zodFieldToCmsWidget("publishedAt", z.string().datetime());
    expect(result.widget).toBe("datetime");
    expect(result.label).toBe("Published At");
  });

  it("should map z.number() to number widget", () => {
    const result = zodFieldToCmsWidget("year", z.number());
    expect(result.widget).toBe("number");
  });

  it("should map z.boolean() to boolean widget", () => {
    const result = zodFieldToCmsWidget("featured", z.boolean());
    expect(result.widget).toBe("boolean");
  });

  it("should map z.enum() to select widget with options", () => {
    const result = zodFieldToCmsWidget(
      "status",
      z.enum(["draft", "published"]),
    );
    expect(result.widget).toBe("select");
    expect(result.options).toEqual(["draft", "published"]);
  });

  it("should unwrap .optional() and set required: false", () => {
    const result = zodFieldToCmsWidget("slug", z.string().optional());
    expect(result.widget).toBe("string");
    expect(result.required).toBe(false);
  });

  it("should map image-entity reference fields to the image widget", () => {
    // Image references are string ids into the image entity type, named by
    // the <role>ImageId convention (coverImageId, ogImageId, ...).
    expect(
      zodFieldToCmsWidget("coverImageId", z.string().optional()).widget,
    ).toBe("image");
    expect(zodFieldToCmsWidget("ogImageId", z.string().optional()).widget).toBe(
      "image",
    );
    expect(zodFieldToCmsWidget("imageId", z.string()).widget).toBe("image");
    // Not references: no ImageId suffix.
    expect(zodFieldToCmsWidget("imageIdea", z.string()).widget).toBe("string");
  });
});
