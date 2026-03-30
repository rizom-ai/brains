import { describe, it, expect } from "bun:test";
import { buildToolCall } from "../src/commands/operate";

describe("buildToolCall", () => {
  describe("list", () => {
    it("should map to system_list with entityType", () => {
      const result = buildToolCall("list", ["post"], {});
      expect(result).toEqual({
        toolName: "system_list",
        toolInput: { entityType: "post" },
      });
    });

    it("should return error when entityType is missing", () => {
      const result = buildToolCall("list", [], {});
      expect("success" in result).toBe(true);
      if ("success" in result) {
        expect(result.success).toBe(false);
      }
    });
  });

  describe("get", () => {
    it("should map to system_get with entityType and id", () => {
      const result = buildToolCall("get", ["post", "my-first-post"], {});
      expect(result).toEqual({
        toolName: "system_get",
        toolInput: { entityType: "post", id: "my-first-post" },
      });
    });

    it("should return error when id is missing", () => {
      const result = buildToolCall("get", ["post"], {});
      expect("success" in result).toBe(true);
    });
  });

  describe("search", () => {
    it("should map to system_search with query", () => {
      const result = buildToolCall("search", ["how to deploy"], {});
      expect(result).toEqual({
        toolName: "system_search",
        toolInput: { query: "how to deploy" },
      });
    });

    it("should return error when query is missing", () => {
      const result = buildToolCall("search", [], {});
      expect("success" in result).toBe(true);
    });
  });

  describe("sync", () => {
    it("should map to directory-sync_sync", () => {
      const result = buildToolCall("sync", [], {});
      expect(result).toEqual({
        toolName: "directory-sync_sync",
        toolInput: {},
      });
    });
  });

  describe("build", () => {
    it("should map to site-builder_build-site for production", () => {
      const result = buildToolCall("build", [], {});
      expect(result).toEqual({
        toolName: "site-builder_build-site",
        toolInput: { environment: "production" },
      });
    });

    it("should use preview environment with --preview flag", () => {
      const result = buildToolCall("build", [], { preview: true });
      expect(result).toEqual({
        toolName: "site-builder_build-site",
        toolInput: { environment: "preview" },
      });
    });
  });

  describe("status", () => {
    it("should map to system_status", () => {
      const result = buildToolCall("status", [], {});
      expect(result).toEqual({
        toolName: "system_status",
        toolInput: {},
      });
    });
  });

  describe("unknown", () => {
    it("should return error for unknown command", () => {
      const result = buildToolCall("foobar", [], {});
      expect("success" in result).toBe(true);
      if ("success" in result) {
        expect(result.success).toBe(false);
      }
    });
  });
});
