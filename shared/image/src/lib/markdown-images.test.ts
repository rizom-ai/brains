import { describe, it, expect } from "bun:test";
import { extractMarkdownImages } from "./markdown-images";

describe("extractMarkdownImages", () => {
  it("extracts markdown images", () => {
    const images = extractMarkdownImages(
      'Text\n\n![Alt text](https://example.com/image.png "Title")\n',
    );

    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      url: "https://example.com/image.png",
      alt: "Alt text",
      title: "Title",
    });
  });

  it("skips images inside code blocks", () => {
    const images = extractMarkdownImages(
      "```md\n![Code](https://example.com/code.png)\n```\n\n![Real](https://example.com/real.png)",
    );

    expect(images).toHaveLength(1);
    expect(images[0]?.url).toBe("https://example.com/real.png");
  });
});
