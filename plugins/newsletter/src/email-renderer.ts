import { markdownToHtml } from "@rizom/brain-ui";
import { stripMarkdown } from "@brains/utils/markdown";

export interface RenderNewsletterEmailInput {
  subject: string;
  content: string;
  previewText?: string | undefined;
}

export interface RenderedNewsletterEmail {
  html: string;
  text: string;
}

/** Render provider-neutral newsletter content for email delivery. */
export function renderNewsletterEmail(
  input: RenderNewsletterEmailInput,
): RenderedNewsletterEmail {
  const body = markdownToHtml(input.content);
  const subject = escapeHtml(input.subject);
  const previewText = input.previewText
    ? `<div class="preview">${escapeHtml(input.previewText)}</div>`
    : "";

  return {
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f4f0; color: #20201d; font-family: Georgia, 'Times New Roman', serif; }
    .preview { display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent; }
    .shell { width: 100%; padding: 32px 16px; }
    .content { box-sizing: border-box; max-width: 640px; margin: 0 auto; padding: 40px; background: #ffffff; border: 1px solid #deded7; line-height: 1.65; }
    h1, h2, h3 { color: #11110f; font-family: Arial, Helvetica, sans-serif; line-height: 1.2; }
    h1 { font-size: 30px; } h2 { font-size: 24px; } h3 { font-size: 19px; }
    p, li { font-size: 17px; }
    a { color: #155eef; }
    img { max-width: 100%; height: auto; }
    blockquote { margin-left: 0; padding-left: 20px; border-left: 3px solid #c9c9c0; color: #55554f; }
    code { font-family: 'Courier New', monospace; }
    pre { overflow-x: auto; padding: 16px; background: #f4f4f0; }
    @media only screen and (max-width: 680px) {
      .shell { padding: 0; }
      .content { padding: 24px; border-left: 0; border-right: 0; }
    }
  </style>
</head>
<body>
  ${previewText}
  <div class="shell">
    <main class="content">${body}</main>
  </div>
</body>
</html>`,
    text: stripMarkdown(input.content),
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
