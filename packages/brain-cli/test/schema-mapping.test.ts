import { describe, it, expect } from "bun:test";
import { mapArgsToInput } from "@brains/mcp-service";
import { z } from "@brains/utils";

describe("mapArgsToInput", () => {
  it("should map single positional arg to required field", () => {
    const schema = { entityType: z.string() };
    const result = mapArgsToInput(schema, ["post"], {});
    expect(result).toEqual({ entityType: "post" });
  });

  it("should map multiple positional args to required fields in order", () => {
    const schema = { entityType: z.string(), id: z.string() };
    const result = mapArgsToInput(schema, ["post", "my-first-post"], {});
    expect(result).toEqual({ entityType: "post", id: "my-first-post" });
  });

  it("should map flags to optional fields", () => {
    const schema = {
      query: z.string(),
      limit: z.number().optional(),
    };
    const result = mapArgsToInput(schema, ["deploy"], { limit: "10" });
    expect(result).toEqual({ query: "deploy", limit: 10 });
  });

  it("should handle empty schema with no args", () => {
    const schema = {};
    const result = mapArgsToInput(schema, [], {});
    expect(result).toEqual({});
  });

  it("should use defaults from schema for missing optional fields", () => {
    const schema = {
      environment: z.string().default("production"),
    };
    const result = mapArgsToInput(schema, [], {});
    expect(result).toEqual({ environment: "production" });
  });

  it("should override defaults with positional args", () => {
    const schema = {
      environment: z.string().default("production"),
    };
    const result = mapArgsToInput(schema, ["preview"], {});
    expect(result).toEqual({ environment: "preview" });
  });

  it("should coerce string flag to number when schema expects number", () => {
    const schema = {
      entityType: z.string(),
      limit: z.number().optional(),
    };
    const result = mapArgsToInput(schema, ["post"], { limit: "5" });
    expect(result).toEqual({ entityType: "post", limit: 5 });
  });

  it("should handle boolean flags", () => {
    const schema = {
      entityType: z.string(),
      verbose: z.boolean().optional(),
    };
    const result = mapArgsToInput(schema, ["post"], { verbose: "true" });
    expect(result).toEqual({ entityType: "post", verbose: true });
  });

  it("should skip extra positional args beyond schema fields", () => {
    const schema = { entityType: z.string() };
    const result = mapArgsToInput(schema, ["post", "extra", "stuff"], {});
    expect(result).toEqual({ entityType: "post" });
  });

  it("should handle optional positional args", () => {
    const schema = {
      entityType: z.string(),
      status: z.string().optional(),
    };
    const result = mapArgsToInput(schema, ["post"], {});
    expect(result).toEqual({ entityType: "post" });
  });
});
