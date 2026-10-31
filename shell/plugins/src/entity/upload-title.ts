import { markdownBody } from "@brains/entity-service";
import { firstMarkdownHeading } from "@brains/utils/markdown";

const textUploadMediaTypes = new Set([
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/json",
]);

/** Whether an upload's bytes are text that can be read as Markdown. */
export function isTextUploadMediaType(mediaType: string): boolean {
  return textUploadMediaTypes.has(mediaType.toLowerCase());
}

/**
 * The title an uploaded file is saved under: the title the user gave, else
 * the first `#` heading of its Markdown text, else its file name without the
 * extension.
 */
export function uploadTitle(input: {
  title?: string | undefined;
  filename: string;
  markdown?: string | undefined;
}): string {
  const given = input.title?.trim();
  if (given) return given;
  const heading =
    input.markdown !== undefined
      ? firstMarkdownHeading(markdownBody(input.markdown), { depth: 1 })
      : undefined;
  if (heading) return heading;
  const withoutExtension = input.filename.replace(/\.[^.]+$/, "").trim();
  return withoutExtension || input.filename;
}
