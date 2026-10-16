import { describe, expect, it } from "bun:test";
import { blogExcerptTemplate } from "../src/templates/excerpt-template";

describe("blogExcerptTemplate", () => {
  it("asks for a summary without marketing wording of its own", () => {
    const prompt = blogExcerptTemplate.basePrompt ?? "";

    expect(prompt).not.toMatch(/compelling|engaging/i);
    expect(prompt).toContain("120-160 characters");
  });
});
