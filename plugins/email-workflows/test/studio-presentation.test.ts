import { describe, expect, it } from "bun:test";
import { mailItemFrontmatterSchema } from "../src/entity/schemas/mail-item";

function widget(field: { meta(): unknown }): unknown {
  const meta = field.meta();
  return typeof meta === "object" && meta !== null
    ? Reflect.get(meta, "studioWidget")
    : undefined;
}

describe("a mail item in Studio", () => {
  it("shows where it came from as facts and hides its bookkeeping", () => {
    const shape = mailItemFrontmatterSchema.shape;
    expect(
      Object.fromEntries(
        Object.entries(shape)
          .map(([name, field]) => [name, widget(field)])
          .filter(([, value]) => value !== undefined),
      ),
    ).toEqual({
      receivedAt: "provenance",
      source: "provenance",
      senderLabel: "provenance",
    });
  });
});
