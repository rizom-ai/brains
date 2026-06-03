import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AttachmentPart } from "./data-parts";

describe("AttachmentPart", () => {
  it("marks ready image previews to preserve their native aspect ratio", () => {
    const markup = renderToStaticMarkup(
      createElement(AttachmentPart, {
        data: {
          kind: "attachment",
          id: "attachment:portrait",
          title: "Portrait image",
          attachment: {
            mediaType: "image/png",
            url: "/api/chat/attachments/image?id=portrait",
            filename: "portrait.png",
          },
        },
      }),
    );

    expect(markup).toContain('class="web-chat-attachment-preview"');
    expect(markup).toContain('data-fit="contain"');
  });
});
