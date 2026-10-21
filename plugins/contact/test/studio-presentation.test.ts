import { describe, expect, it } from "bun:test";
import { contactFrontmatterSchema } from "../src/entity/schema";

function widget(field: { meta(): unknown }): unknown {
  const meta = field.meta();
  return typeof meta === "object" && meta !== null
    ? Reflect.get(meta, "studioWidget")
    : undefined;
}

describe("a contact request in Studio", () => {
  it("shows where it came from as facts and hides its bookkeeping", () => {
    const shape = contactFrontmatterSchema.shape;
    expect(
      Object.fromEntries(
        Object.entries(shape)
          .map(([name, field]) => [name, widget(field)])
          .filter(([, value]) => value !== undefined),
      ),
    ).toEqual({
      name: "provenance",
      email: "provenance",
      receivedAt: "provenance",
      expiresAt: "provenance",
      notification: "provenance",
    });
  });
});
