import { describe, expect, it } from "bun:test";
import { bookFrontmatterSchema } from "../src/schemas/book";

function widget(field: { meta(): unknown }): unknown {
  const meta = field.meta();
  return typeof meta === "object" && meta !== null
    ? Reflect.get(meta, "studioWidget")
    : undefined;
}

describe("a book in Studio", () => {
  it("shows where it came from as facts and hides its bookkeeping", () => {
    const shape = bookFrontmatterSchema.shape;
    expect(
      Object.fromEntries(
        Object.entries(shape)
          .map(([name, field]) => [name, widget(field)])
          .filter(([, value]) => value !== undefined),
      ),
    ).toEqual({
      source: "provenance",
      length: "provenance",
      sections: "provenance",
      continuations: "hidden",
    });
  });
});
