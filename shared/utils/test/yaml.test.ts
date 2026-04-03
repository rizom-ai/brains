import { describe, it, expect } from "bun:test";
import { z } from "zod";
import { parseYamlDocument } from "../src/yaml";

describe("parseYamlDocument", () => {
  describe("without schema", () => {
    it("should parse valid YAML document", () => {
      const result = parseYamlDocument("brain: rover\npreset: pro");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data["brain"]).toBe("rover");
        expect(result.data["preset"]).toBe("pro");
      }
    });

    it("should return error for empty string", () => {
      const result = parseYamlDocument("");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("file is empty");
    });

    it("should return error for whitespace-only string", () => {
      const result = parseYamlDocument("   \n  \n  ");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("file is empty");
    });

    it("should return error for invalid YAML syntax", () => {
      const result = parseYamlDocument("brain: [invalid: yaml: here");
      expect(result.ok).toBe(false);
    });

    it("should return error for bare string", () => {
      const result = parseYamlDocument("just a string");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("expected a YAML mapping");
    });

    it("should return error for array", () => {
      const result = parseYamlDocument("- item1\n- item2");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("expected a YAML mapping");
    });

    it("should return error for null/tilde", () => {
      const result = parseYamlDocument("~");
      expect(result.ok).toBe(false);
    });

    it("should handle nested objects", () => {
      const yaml = "brain: rover\nplugins:\n  sync:\n    repo: test";
      const result = parseYamlDocument(yaml);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data["brain"]).toBe("rover");
        expect(result.data["plugins"]).toBeDefined();
      }
    });
  });

  describe("with schema", () => {
    const schema = z.object({
      brain: z.string(),
      preset: z.string().optional(),
    });

    it("should return typed data when schema matches", () => {
      const result = parseYamlDocument("brain: rover\npreset: pro", schema);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.brain).toBe("rover");
        expect(result.data.preset).toBe("pro");
      }
    });

    it("should return error when required field is missing", () => {
      const result = parseYamlDocument("preset: pro", schema);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("brain");
    });

    it("should still catch empty files before schema validation", () => {
      const result = parseYamlDocument("", schema);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("file is empty");
    });

    it("should still catch invalid YAML before schema validation", () => {
      const result = parseYamlDocument("{{bad", schema);
      expect(result.ok).toBe(false);
    });
  });
});
