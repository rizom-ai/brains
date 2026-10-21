import { describe, expect, it } from "bun:test";
import { emailReplyDraftFrontmatterSchema } from "../src/reply-drafts/entity/schema";

function widget(field: { meta(): unknown }): unknown {
  const meta = field.meta();
  return typeof meta === "object" && meta !== null
    ? Reflect.get(meta, "studioWidget")
    : undefined;
}

describe("a reply draft in Studio", () => {
  it("shows where it came from as facts and hides its bookkeeping", () => {
    const shape = emailReplyDraftFrontmatterSchema.shape;
    expect(
      Object.fromEntries(
        Object.entries(shape)
          .map(([name, field]) => [name, widget(field)])
          .filter(([, value]) => value !== undefined),
      ),
    ).toEqual({
      mailItemId: "provenance",
      revision: "hidden",
      sentAt: "provenance",
      providerDeliveryId: "hidden",
    });
  });
});
