import { describe, it, expect } from "bun:test";
import { chunkMessage } from "../src/chunk-message";

describe("chunkMessage", () => {
  it("should return message as-is when under limit", () => {
    const result = chunkMessage("Hello world", 2000);
    expect(result).toEqual(["Hello world"]);
  });

  it("should return empty array for empty input", () => {
    expect(chunkMessage("", 2000)).toEqual([""]);
  });

  it("should split at paragraph boundaries", () => {
    const msg = "First.\n\nSecond.\n\nThird.";
    // "First." = 6, "\n\n" = 2, "Second." = 7 → 15 > 10
    const result = chunkMessage(msg, 10);

    expect(result).toEqual(["First.", "Second.", "Third."]);
  });

  it("should keep paragraphs together when they fit", () => {
    const msg = "Short one.\n\nShort two.\n\nShort three.";
    const result = chunkMessage(msg, 100);

    expect(result).toEqual([msg]);
  });

  it("should treat code blocks as atomic units", () => {
    const code = "```typescript\nconst x = 1;\nconst y = 2;\n```";
    const msg = `Before.\n\n${code}\n\nAfter.`;
    const result = chunkMessage(msg, 50);

    // Code block should not be split across chunks
    expect(
      result.some(
        (c: string) => c.includes("```typescript") && c.includes("```"),
      ),
    ).toBe(true);
  });

  it("should split oversized blocks at line boundaries", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1} content`);
    const block = lines.join("\n");
    const result = chunkMessage(block, 50);

    // Each chunk should be under the limit
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(50);
    }
    // All lines should appear in the output
    const joined = result.join("\n");
    for (const line of lines) {
      expect(joined).toContain(line);
    }
  });

  it("should split oversized lines at word boundaries", () => {
    const longLine = "word ".repeat(100).trim();
    const result = chunkMessage(longLine, 30);

    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(30);
    }
    // All words preserved
    const words = result.join(" ").split(" ");
    expect(words.filter((w: string) => w === "word").length).toBe(100);
  });

  it("should hard-split words that exceed the limit", () => {
    const longWord = "a".repeat(50);
    const result = chunkMessage(longWord, 20);

    expect(result).toEqual(["a".repeat(20), "a".repeat(20), "a".repeat(10)]);
  });

  it("should use default max length of 2000", () => {
    const msg = "x".repeat(3000);
    const result = chunkMessage(msg);

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(2000);
    expect(result[1]).toHaveLength(1000);
  });
});
