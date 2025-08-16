import { describe, it, expect } from "bun:test";
import { slugify, generateIdFromText } from "../src/string-utils";

describe("string-utils", () => {
  describe("slugify", () => {
    it("should convert to lowercase", () => {
      expect(slugify("Hello World")).toBe("hello-world");
      expect(slugify("UPPERCASE")).toBe("uppercase");
      expect(slugify("MiXeD CaSe")).toBe("mixed-case");
    });

    it("should replace spaces with hyphens", () => {
      expect(slugify("multiple   spaces")).toBe("multiple-spaces");
      expect(slugify("tabs\tand\tspaces")).toBe("tabs-and-spaces");
      expect(slugify("new\nlines")).toBe("new-lines");
    });

    it("should remove special characters", () => {
      expect(slugify("Hello! World?")).toBe("hello-world");
      expect(slugify("email@example.com")).toBe("emailexamplecom");
      expect(slugify("price: $99.99")).toBe("price-9999");
      expect(slugify("C++ Programming")).toBe("c-programming");
    });

    it("should handle multiple hyphens and underscores", () => {
      expect(slugify("hello---world")).toBe("hello-world");
      expect(slugify("hello___world")).toBe("hello-world");
      expect(slugify("hello-_-world")).toBe("hello-world");
    });

    it("should trim leading and trailing spaces/hyphens", () => {
      expect(slugify("  hello world  ")).toBe("hello-world");
      expect(slugify("---hello-world---")).toBe("hello-world");
      expect(slugify("-hello world-")).toBe("hello-world");
    });

    it("should handle edge cases", () => {
      expect(slugify("")).toBe("");
      expect(slugify("   ")).toBe("");
      expect(slugify("---")).toBe("");
      expect(slugify("!!!")).toBe("");
      expect(slugify("123")).toBe("123");
      expect(slugify("123-456")).toBe("123-456");
    });

    it("should handle unicode characters", () => {
      expect(slugify("Café")).toBe("caf");
      expect(slugify("naïve")).toBe("nave");
      expect(slugify("emoji 😀 test")).toBe("emoji-test");
    });

    it("should preserve word boundaries", () => {
      expect(slugify("camelCase")).toBe("camelcase");
      expect(slugify("snake_case")).toBe("snake-case");
      expect(slugify("kebab-case")).toBe("kebab-case");
    });
  });

  describe("generateIdFromText", () => {
    it("should generate ID from text", () => {
      expect(generateIdFromText("Hello World")).toBe("hello-world");
      expect(generateIdFromText("Machine Learning Basics")).toBe(
        "machine-learning-basics"
      );
    });

    it("should append suffix when provided", () => {
      expect(generateIdFromText("Hello World", "123")).toBe("hello-world-123");
      expect(generateIdFromText("Test", "abc")).toBe("test-abc");
    });

    it("should handle empty slug with timestamp fallback", () => {
      const id1 = generateIdFromText("!!!");
      expect(id1).toMatch(/^id-[a-z0-9]+$/);

      const id2 = generateIdFromText("", "suffix");
      expect(id2).toMatch(/^id-[a-z0-9]+-suffix$/);
    });

    it("should handle special characters in text", () => {
      expect(generateIdFromText("AI & Machine Learning")).toBe(
        "ai-machine-learning"
      );
      expect(generateIdFromText("Q&A: Best Practices")).toBe("qa-best-practices");
      expect(generateIdFromText("C++ vs. Java")).toBe("c-vs-java");
    });

    it("should generate unique IDs for same text with different suffixes", () => {
      const id1 = generateIdFromText("Test Topic", "1");
      const id2 = generateIdFromText("Test Topic", "2");
      expect(id1).not.toBe(id2);
      expect(id1).toBe("test-topic-1");
      expect(id2).toBe("test-topic-2");
    });

    it("should handle very long text", () => {
      const longTitle = "This is a very long title ".repeat(10);
      const id = generateIdFromText(longTitle);
      expect(id).toMatch(/^this-is-a-very-long-title/);
      expect(id).not.toContain("  ");
      expect(id).not.toStartWith("-");
      expect(id).not.toEndWith("-");
    });
  });
});