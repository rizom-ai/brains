import { describe, it, expect } from "bun:test";
import { z } from "@brains/utils";
import { FrontmatterContentHelper } from "../src/frontmatter-content-helper";

const testSchema = z.object({
  name: z.string(),
  role: z.string(),
  values: z.array(z.string()),
});

type TestData = z.infer<typeof testSchema>;

/** Minimal legacy parser for testing */
const createLegacyParser = (): { parse(content: string): TestData } => ({
  parse(content: string): TestData {
    const nameMatch = content.match(/## Name\n(.+)/);
    const roleMatch = content.match(/## Role\n(.+)/);
    const valuesMatch = content.match(/## Values\n([\s\S]*?)$/);
    const values =
      valuesMatch?.[1]
        ?.split("\n")
        .filter((l) => l.startsWith("- "))
        .map((l) => l.slice(2).trim()) ?? [];
    return testSchema.parse({
      name: nameMatch?.[1]?.trim() ?? "",
      role: roleMatch?.[1]?.trim() ?? "",
      values,
    });
  },
});

function createHelper(): FrontmatterContentHelper<TestData> {
  return new FrontmatterContentHelper(testSchema, createLegacyParser);
}

describe("FrontmatterContentHelper", () => {
  describe("parse", () => {
    it("should parse frontmatter format", () => {
      const content = `---
name: Test Brain
role: Assistant
values:
  - clarity
  - accuracy
---
`;
      const helper = createHelper();
      const result = helper.parse(content);

      expect(result.name).toBe("Test Brain");
      expect(result.role).toBe("Assistant");
      expect(result.values).toEqual(["clarity", "accuracy"]);
    });

    it("should parse legacy structured content format", () => {
      const content = `# Title

## Name
Test Brain

## Role
Assistant

## Values
- clarity
- accuracy`;

      const helper = createHelper();
      const result = helper.parse(content);

      expect(result.name).toBe("Test Brain");
      expect(result.role).toBe("Assistant");
      expect(result.values).toEqual(["clarity", "accuracy"]);
    });

    it("should throw for invalid frontmatter data", () => {
      const content = `---
invalid: true
---
`;
      const helper = createHelper();
      expect(() => helper.parse(content)).toThrow();
    });
  });

  describe("format", () => {
    it("should format data as frontmatter markdown", () => {
      const helper = createHelper();
      const result = helper.format({
        name: "Test",
        role: "Helper",
        values: ["a", "b"],
      });

      expect(result).toContain("---");
      expect(result).toContain("name: Test");
      expect(result).toContain("role: Helper");
      expect(result).toContain("- a");
      expect(result).toContain("- b");
    });

    it("should include body when provided", () => {
      const helper = createHelper();
      const result = helper.format(
        { name: "Test", role: "Helper", values: [] },
        "Body content here",
      );

      expect(result).toContain("---");
      expect(result).toContain("name: Test");
      expect(result).toContain("Body content here");
    });
  });

  describe("toFrontmatterString", () => {
    it("should generate just the frontmatter block", () => {
      const helper = createHelper();
      const result = helper.toFrontmatterString({
        name: "Test",
        role: "Helper",
        values: ["x"],
      });

      expect(result).toMatch(/^---\n/);
      expect(result).toMatch(/\n---$/);
      expect(result).toContain("name: Test");
    });
  });

  describe("convertToFrontmatter", () => {
    it("should pass through frontmatter content unchanged", () => {
      const content = `---
name: Test
role: Helper
values:
  - a
---
`;
      const helper = createHelper();
      const result = helper.convertToFrontmatter(content);

      expect(result).toBe(content);
    });

    it("should convert legacy structured content to frontmatter", () => {
      const content = `# Title

## Name
Test Brain

## Role
Assistant

## Values
- clarity`;

      const helper = createHelper();
      const result = helper.convertToFrontmatter(content);

      expect(result).toContain("---");
      expect(result).toContain("name: Test Brain");
      expect(result).toContain("role: Assistant");
      expect(result).toContain("- clarity");
      // Should NOT contain legacy format markers
      expect(result).not.toContain("## Name");
    });
  });

  describe("roundtrip", () => {
    it("should preserve data through format and parse", () => {
      const original = {
        name: "Roundtrip Brain",
        role: "Tester",
        values: ["precision", "coverage"],
      };

      const helper = createHelper();
      const formatted = helper.format(original);
      const parsed = helper.parse(formatted);

      expect(parsed).toEqual(original);
    });
  });
});
