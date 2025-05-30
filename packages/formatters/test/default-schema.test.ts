import { describe, expect, it } from "bun:test";
import { DefaultSchemaFormatter } from "../src/formatters/default-schema";

describe("DefaultSchemaFormatter", () => {
  const formatter = new DefaultSchemaFormatter();

  describe("format", () => {
    it("should format strings as-is", () => {
      expect(formatter.format("hello world")).toBe("hello world");
    });

    it("should format numbers as strings", () => {
      expect(formatter.format(42)).toBe("42");
      expect(formatter.format(3.14)).toBe("3.14");
    });

    it("should format booleans", () => {
      expect(formatter.format(true)).toBe("true");
      expect(formatter.format(false)).toBe("false");
    });

    it("should format null and undefined", () => {
      expect(formatter.format(null)).toBe("null");
      expect(formatter.format(undefined)).toBe("");
    });

    it("should extract message field from objects", () => {
      expect(formatter.format({ message: "Hello" })).toBe("Hello");
    });

    it("should extract text field from objects", () => {
      expect(formatter.format({ text: "World" })).toBe("World");
    });

    it("should extract display field from objects", () => {
      expect(formatter.format({ display: "Test" })).toBe("Test");
    });

    it("should prefer message over text and display", () => {
      expect(
        formatter.format({
          message: "Priority 1",
          text: "Priority 2",
          display: "Priority 3",
        }),
      ).toBe("Priority 1");
    });

    it("should format objects without display fields as JSON", () => {
      const obj = { foo: "bar", num: 42 };
      expect(formatter.format(obj)).toBe(JSON.stringify(obj, null, 2));
    });

    it("should format arrays as JSON", () => {
      const arr = [1, 2, 3];
      expect(formatter.format(arr)).toBe(JSON.stringify(arr, null, 2));
    });

    it("should handle objects with non-string display fields", () => {
      expect(formatter.format({ message: 42 })).toBe(
        JSON.stringify({ message: 42 }, null, 2),
      );
      expect(formatter.format({ text: null })).toBe(
        JSON.stringify({ text: null }, null, 2),
      );
    });

    it("should handle circular references gracefully", () => {
      const obj: any = { a: 1 };
      obj.circular = obj;
      expect(formatter.format(obj)).toBe("[Unable to format data]");
    });
  });

  describe("canFormat", () => {
    it("should always return true", () => {
      expect(formatter.canFormat(null)).toBe(true);
      expect(formatter.canFormat(undefined)).toBe(true);
      expect(formatter.canFormat("string")).toBe(true);
      expect(formatter.canFormat(123)).toBe(true);
      expect(formatter.canFormat({})).toBe(true);
      expect(formatter.canFormat([])).toBe(true);
    });
  });
});
