import { describe, it, expect } from "bun:test";
import { z } from "../src/zod";
import { fromYaml, parseYamlDocument } from "../src/yaml";

/** Compile-time exact type equality; `tsc --noEmit` is the assertion. */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

describe("fromYaml", () => {
  it("returns unknown so callers must narrow before use", () => {
    const returnsUnknown: Equals<ReturnType<typeof fromYaml>, unknown> = true;
    expect(returnsUnknown).toBe(true);
  });

  it("parses a mapping", () => {
    const parsed = fromYaml("name: example\nenabled: true");
    expect(parsed).toEqual({ name: "example", enabled: true });
  });

  it("parses non-mapping documents without complaint", () => {
    const list = fromYaml("- a\n- b");
    if (!Array.isArray(list)) throw new Error("expected a YAML sequence");
    expect(list).toEqual(["a", "b"]);

    const scalar = fromYaml("just a string");
    if (typeof scalar !== "string") throw new Error("expected a YAML scalar");
    expect(scalar).toBe("just a string");
  });

  it("returns undefined for an empty document", () => {
    expect(fromYaml("")).toBeUndefined();
  });

  it("throws on invalid YAML syntax", () => {
    expect(() => fromYaml("brain: [invalid: yaml: here")).toThrow();
  });
});

describe("parseYamlDocument", () => {
  describe("without schema", () => {
    it("should parse valid YAML document", () => {
      const result = parseYamlDocument("name: example\nenabled: true");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data["name"]).toBe("example");
        expect(result.data["enabled"]).toBe(true);
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
