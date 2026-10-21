import { describe, expect, it } from "bun:test";
import { promptFrontmatterSchema } from "../src/schemas/prompt";

function widget(field: { meta(): unknown }): unknown {
  const meta = field.meta();
  return typeof meta === "object" && meta !== null
    ? Reflect.get(meta, "studioWidget")
    : undefined;
}

describe("a prompt in Studio", () => {
  it("shows where it came from as facts and hides its bookkeeping", () => {
    const shape = promptFrontmatterSchema.shape;
    expect(
      Object.fromEntries(
        Object.entries(shape)
          .map(([name, field]) => [name, widget(field)])
          .filter(([, value]) => value !== undefined),
      ),
    ).toEqual({
      defaultHash: "hidden",
    });
  });
});
