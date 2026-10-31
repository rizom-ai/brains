import { describe, expect, it } from "bun:test";
import { isTextUploadMediaType, uploadTitle } from "../../src";

describe("uploadTitle", () => {
  it("names an upload by the title the user gave, before anything in the file", () => {
    expect(
      uploadTitle({
        title: "  My Own Title ",
        filename: "notes.md",
        markdown: "# Heading Title",
      }),
    ).toBe("My Own Title");
  });

  it("reads a given title that only repeats the file name as no title", () => {
    expect(
      uploadTitle({
        title: "notes.md",
        filename: "notes.md",
        markdown: "# Heading Title",
      }),
    ).toBe("Heading Title");
    expect(uploadTitle({ title: "photo", filename: "photo.png" })).toBe(
      "photo",
    );
    expect(uploadTitle({ title: "Photo", filename: "photo.png" })).toBe(
      "Photo",
    );
  });

  it("names an upload by its first # heading, past any frontmatter", () => {
    expect(
      uploadTitle({
        filename: "2026-10-meeting.md",
        markdown:
          "---\ntags: [sync]\n---\n\nIntro line\n\n## Agenda\n\n# Quarterly Planning Sync\n",
      }),
    ).toBe("Quarterly Planning Sync");
  });

  it("falls back to the file name without its extension when there is no # heading", () => {
    expect(
      uploadTitle({
        filename: "field-notes.md",
        markdown: "## Only a section\n\nBody",
      }),
    ).toBe("field-notes");
    expect(uploadTitle({ filename: "photo.png" })).toBe("photo");
    expect(uploadTitle({ filename: ".env" })).toBe(".env");
  });

  it("does not take a heading from code or unreadable frontmatter", () => {
    expect(
      uploadTitle({
        filename: "snippet.md",
        markdown: "```md\n# Not a title\n```\n",
      }),
    ).toBe("snippet");
    expect(
      uploadTitle({
        filename: "broken.md",
        markdown: "---\n: : :\n---\n\n# Still a Title\n",
      }),
    ).toBe("Still a Title");
  });
});

describe("isTextUploadMediaType", () => {
  it("reads text, markdown and JSON uploads as text", () => {
    expect(isTextUploadMediaType("text/markdown")).toBe(true);
    expect(isTextUploadMediaType("TEXT/PLAIN")).toBe(true);
    expect(isTextUploadMediaType("application/json")).toBe(true);
    expect(isTextUploadMediaType("application/pdf")).toBe(false);
    expect(isTextUploadMediaType("image/png")).toBe(false);
  });
});
