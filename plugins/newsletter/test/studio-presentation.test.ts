import { describe, expect, it } from "bun:test";
import { newsletterFrontmatterSchema } from "../src/entity/schemas/newsletter";

function widget(field: { meta(): unknown }): unknown {
  const meta = field.meta();
  return typeof meta === "object" && meta !== null
    ? Reflect.get(meta, "studioWidget")
    : undefined;
}

describe("a newsletter in Studio", () => {
  it("shows where it came from as facts and hides its bookkeeping", () => {
    const shape = newsletterFrontmatterSchema.shape;
    expect(
      Object.fromEntries(
        Object.entries(shape)
          .map(([name, field]) => [name, widget(field)])
          .filter(([, value]) => value !== undefined),
      ),
    ).toEqual({
      sentAt: "provenance",
      sourceEntityType: "provenance",
    });
  });
});
