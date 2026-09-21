import { describe, expect, it } from "bun:test";
import {
  getArtifactEntityFilename,
  resolveArtifactEntityRefFromCard,
  resolveArtifactEntityRefFromUrl,
} from "../../src/message-interface/artifact-entity";

describe("artifact entity helpers", () => {
  it("resolves artifact entity refs from attachment card source metadata", () => {
    expect(
      resolveArtifactEntityRefFromCard({
        attachment: {
          mediaType: "application/pdf",
          url: "/api/chat/attachments/document?id=ignored",
          source: { entityType: "document", entityId: "deck-1" },
        },
      }),
    ).toEqual({ entityType: "document", id: "deck-1" });
  });

  it("resolves artifact entity refs from web-chat attachment URLs", () => {
    expect(
      resolveArtifactEntityRefFromUrl(
        "/api/chat/attachments/image?id=robot-1&download=1",
      ),
    ).toEqual({ entityType: "image", id: "robot-1" });
    expect(
      resolveArtifactEntityRefFromUrl(
        "https://brain.test/api/chat/attachments/document?id=deck-1",
      ),
    ).toEqual({ entityType: "document", id: "deck-1" });
  });

  it("rejects non-artifact URLs and missing ids", () => {
    expect(
      resolveArtifactEntityRefFromUrl("/api/chat/uploads?id=upload-1"),
    ).toBeUndefined();
    expect(
      resolveArtifactEntityRefFromUrl("/api/chat/attachments/image"),
    ).toBeUndefined();
  });

  it("derives artifact filenames from metadata or media type", () => {
    expect(
      getArtifactEntityFilename(
        { filename: "report.pdf" },
        "deck-1",
        "document",
        "application/pdf",
      ),
    ).toBe("report.pdf");
    expect(
      getArtifactEntityFilename(
        undefined,
        "deck-1",
        "document",
        "application/pdf",
      ),
    ).toBe("deck-1.pdf");
    expect(
      getArtifactEntityFilename(
        { format: "jpeg" },
        "robot-1",
        "image",
        "image/jpeg",
      ),
    ).toBe("robot-1.jpg");
    expect(
      getArtifactEntityFilename(undefined, "robot-1", "image", "image/svg+xml"),
    ).toBe("robot-1.svg");
  });
});
