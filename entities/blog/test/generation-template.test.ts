import { describe, expect, it } from "bun:test";
import { blogGenerationSchema } from "../src/templates/generation-template";

describe("blogGenerationSchema", () => {
  it("rejects empty strings for required generated fields", () => {
    const result = blogGenerationSchema.safeParse({
      title: "",
      content: "   ",
      excerpt: "",
    });

    expect(result.success).toBe(false);
  });

  it("accepts non-empty generated fields", () => {
    const result = blogGenerationSchema.safeParse({
      title: "False Media",
      content: "A real blog post body.",
      excerpt: "A concise summary.",
    });

    expect(result.success).toBe(true);
  });
});
