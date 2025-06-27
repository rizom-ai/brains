import { describe, expect, it } from "bun:test";
import { ResponseFormatter } from "../../src/formatters/base";

// Test implementation of ResponseFormatter
class TestFormatter extends ResponseFormatter {
  format(data: unknown): string {
    return "test";
  }

  canFormat(data: unknown): boolean {
    return true;
  }
}

describe("ResponseFormatter", () => {
  const formatter = new TestFormatter();

  describe("formatKeyValue", () => {
    it("should format key-value pairs", () => {
      // @ts-ignore - accessing protected method for testing
      expect(formatter.formatKeyValue("Name", "John")).toBe("**Name:** John");
      expect(formatter.formatKeyValue("Age", 30)).toBe("**Age:** 30");
    });

    it("should handle null/undefined values", () => {
      // @ts-ignore
      expect(formatter.formatKeyValue("Key", null)).toBe("");
      // @ts-ignore
      expect(formatter.formatKeyValue("Key", undefined)).toBe("");
    });
  });

  describe("formatList", () => {
    it("should format arrays as bullet lists", () => {
      // @ts-ignore
      const result = formatter.formatList(["apple", "banana", "cherry"]);
      expect(result).toBe("- apple\n- banana\n- cherry");
    });

    it("should handle non-string items", () => {
      // @ts-ignore
      const result = formatter.formatList([1, true, null]);
      expect(result).toBe("- 1\n- true\n- null");
    });
  });

  describe("formatTable", () => {
    it("should create markdown tables", () => {
      // @ts-ignore
      const result = formatter.formatTable(
        ["Name", "Age"],
        [
          ["John", 30],
          ["Jane", 25],
        ],
      );

      expect(result).toContain("| Name | Age |");
      expect(result).toContain("| --- | --- |");
      expect(result).toContain("| John | 30 |");
      expect(result).toContain("| Jane | 25 |");
    });

    it("should handle null values in cells", () => {
      // @ts-ignore
      const result = formatter.formatTable(["Col1", "Col2"], [["Value", null]]);

      expect(result).toContain("| Value |  |");
    });
  });

  describe("formatCodeBlock", () => {
    it("should create code blocks", () => {
      // @ts-ignore
      const result = formatter.formatCodeBlock("const x = 1;", "typescript");
      expect(result).toBe("```typescript\nconst x = 1;\n```");
    });

    it("should work without language", () => {
      // @ts-ignore
      const result = formatter.formatCodeBlock("code");
      expect(result).toBe("```\ncode\n```");
    });
  });

  describe("hasFields", () => {
    it("should check for object fields", () => {
      const obj = { name: "John", age: 30 };

      // @ts-ignore
      expect(formatter.hasFields(obj, ["name"])).toBe(true);
      // @ts-ignore
      expect(formatter.hasFields(obj, ["name", "age"])).toBe(true);
      // @ts-ignore
      expect(formatter.hasFields(obj, ["name", "email"])).toBe(false);
    });

    it("should return false for non-objects", () => {
      // @ts-ignore
      expect(formatter.hasFields(null, ["field"])).toBe(false);
      // @ts-ignore
      expect(formatter.hasFields("string", ["field"])).toBe(false);
      // @ts-ignore
      expect(formatter.hasFields(123, ["field"])).toBe(false);
    });
  });
});
