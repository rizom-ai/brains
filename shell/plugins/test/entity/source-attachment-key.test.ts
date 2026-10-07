import { describe, expect, it } from "bun:test";
import { sourceAttachmentKey } from "../../src/entity/source-attachment-key";

describe("sourceAttachmentKey", () => {
  const carousel = {
    sourceEntityType: "deck",
    sourceEntityId: "deck-1",
    attachmentType: "carousel",
  };

  it("changes when the source's content changes", () => {
    // The whole point: a re-request after an edit must not hand back the
    // artifact rendered from the old content.
    expect(
      sourceAttachmentKey({ ...carousel, sourceContentHash: "a" }),
    ).not.toBe(sourceAttachmentKey({ ...carousel, sourceContentHash: "b" }));
  });

  it("separates artifacts of different kinds from one source", () => {
    // A deck's carousel and its printable are two artifacts, not one reused
    // for both.
    expect(
      sourceAttachmentKey({ ...carousel, sourceContentHash: "a" }),
    ).not.toBe(
      sourceAttachmentKey({
        ...carousel,
        attachmentType: "printable",
        sourceContentHash: "a",
      }),
    );
  });

  it("is stable for the same source and kind", () => {
    expect(sourceAttachmentKey({ ...carousel, sourceContentHash: "a" })).toBe(
      sourceAttachmentKey({ ...carousel, sourceContentHash: "a" }),
    );
  });

  it("still identifies the source when its hash is unknown", () => {
    // A source that cannot be read yet still gets a key, so two requests for
    // it agree with each other rather than each allocating an artifact.
    const withoutHash = sourceAttachmentKey(carousel);
    expect(withoutHash).toBe(sourceAttachmentKey(carousel));
    expect(withoutHash).not.toBe(
      sourceAttachmentKey({ ...carousel, sourceContentHash: "a" }),
    );
  });
});
