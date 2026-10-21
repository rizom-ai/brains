import { describe, expect, it } from "bun:test";
import { faqFrontmatterSchema } from "../src";

describe("an FAQ in Studio", () => {
  it("shows how often it was asked and what it drew on as facts", () => {
    const shape = faqFrontmatterSchema.shape;
    expect(shape.asked.meta()).toMatchObject({ studioWidget: "provenance" });
    expect(shape.sources.meta()).toMatchObject({ studioWidget: "provenance" });
    expect(shape.question.meta()).toBeUndefined();
  });
});
