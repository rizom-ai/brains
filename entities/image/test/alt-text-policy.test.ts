import { describe, expect, it } from "bun:test";
import { altTextAction } from "../src/lib/alt-text-policy";

const ready = {
  title: "Harbor",
  alt: "Harbor",
  format: "png" as const,
  width: 1,
  height: 1,
  status: "draft" as const,
};

describe("what an image change means for its alt text", () => {
  it("describes a public image once its bytes are stored", () => {
    expect(
      altTextAction({
        visibility: "public",
        metadata: ready,
        previousMetadata: { title: "Harbor", alt: "Harbor", status: "pending" },
      }),
    ).toBe("describe");
  });

  it("describes a ready image when it is made public", () => {
    expect(
      altTextAction({
        visibility: "public",
        metadata: ready,
        previousMetadata: ready,
      }),
    ).toBe("describe");
  });

  it("leaves a pending, restricted or SVG image to its fallback", () => {
    expect(
      altTextAction({
        visibility: "public",
        metadata: { title: "Harbor", status: "pending" },
      }),
    ).toBe("none");
    expect(altTextAction({ visibility: "restricted", metadata: ready })).toBe(
      "none",
    );
    expect(
      altTextAction({
        visibility: "public",
        metadata: { ...ready, format: "svg" },
      }),
    ).toBe("none");
  });

  it("leaves generated and owner alt text alone", () => {
    for (const altSource of ["generated", "owner"] as const) {
      expect(
        altTextAction({
          visibility: "public",
          metadata: { ...ready, alt: "Boats at dawn", altSource },
          previousMetadata: { ...ready, alt: "Harbor" },
        }),
      ).toBe("none");
    }
  });

  it("marks alt text someone rewrote as the owner's", () => {
    expect(
      altTextAction({
        visibility: "public",
        metadata: { ...ready, alt: "Our harbor", altSource: "generated" },
        previousMetadata: {
          ...ready,
          alt: "Boats at dawn",
          altSource: "generated",
        },
      }),
    ).toBe("mark-owner");
    expect(
      altTextAction({
        visibility: "restricted",
        metadata: { ...ready, alt: "Our harbor" },
        previousMetadata: ready,
      }),
    ).toBe("mark-owner");
  });

  it("does not take the alt text an image is stored with for an edit", () => {
    expect(
      altTextAction({
        visibility: "restricted",
        metadata: { ...ready, alt: "harbor.png" },
        previousMetadata: { title: "Harbor", alt: "Harbor", status: "pending" },
      }),
    ).toBe("none");
  });
});
