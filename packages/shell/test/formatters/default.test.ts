import { describe, expect, it } from "bun:test";
import { DefaultSchemaFormatter } from "@/formatters/default";

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
      const data = { message: "Hello from message field" };
      expect(formatter.format(data)).toBe("Hello from message field");
    });

    it("should extract text field from objects", () => {
      const data = { text: "Hello from text field" };
      expect(formatter.format(data)).toBe("Hello from text field");
    });

    it("should extract display field from objects", () => {
      const data = { display: "Hello from display field" };
      expect(formatter.format(data)).toBe("Hello from display field");
    });

    it("should prefer message over text and display", () => {
      const data = { 
        message: "Message wins", 
        text: "Text loses",
        display: "Display loses"
      };
      expect(formatter.format(data)).toBe("Message wins");
    });

    it("should format objects without display fields as JSON", () => {
      const data = { name: "John", age: 30 };
      const result = formatter.format(data);
      expect(result).toBe(JSON.stringify(data, null, 2));
    });

    it("should format arrays as JSON", () => {
      const data = [1, 2, 3];
      const result = formatter.format(data);
      expect(result).toBe(JSON.stringify(data, null, 2));
    });

    it("should handle objects with non-string display fields", () => {
      const data = { message: 123 };
      // Non-string fields should not be extracted, format as JSON
      expect(formatter.format(data)).toBe(JSON.stringify(data, null, 2));
    });

    it("should handle circular references gracefully", () => {
      interface CircularData {
        name: string;
        self?: CircularData;
      }
      const data: CircularData = { name: "test" };
      data.self = data;
      expect(formatter.format(data)).toBe("[Unable to format data]");
    });
  });

  describe("canFormat", () => {
    it("should always return true", () => {
      expect(formatter.canFormat("string")).toBe(true);
      expect(formatter.canFormat(123)).toBe(true);
      expect(formatter.canFormat(null)).toBe(true);
      expect(formatter.canFormat(undefined)).toBe(true);
      expect(formatter.canFormat({})).toBe(true);
      expect(formatter.canFormat([])).toBe(true);
    });
  });
});