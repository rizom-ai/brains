import { describe, it, expect } from "bun:test";
import { computeContentHash } from "./hash";

describe("computeContentHash", () => {
  it("should return consistent hash for same content", () => {
    const content = "Hello, world!";
    const hash1 = computeContentHash(content);
    const hash2 = computeContentHash(content);
    expect(hash1).toBe(hash2);
  });

  it("should return different hash for different content", () => {
    const hash1 = computeContentHash("Hello");
    const hash2 = computeContentHash("World");
    expect(hash1).not.toBe(hash2);
  });

  it("should return a 64-character hex string (SHA256)", () => {
    const hash = computeContentHash("test content");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should handle empty string", () => {
    const hash = computeContentHash("");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should handle unicode content", () => {
    const hash = computeContentHash("日本語テスト 🎉");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should be sensitive to whitespace", () => {
    const hash1 = computeContentHash("hello world");
    const hash2 = computeContentHash("hello  world");
    expect(hash1).not.toBe(hash2);
  });
});
