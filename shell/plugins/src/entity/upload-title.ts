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

function fileNameStem(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").trim();
}

/**
 * Whether a title only repeats the upload's file name, with or without its
 * extension: the name the file arrived under, not a title anyone chose.
 */
export function repeatsUploadFileName(
  title: string | undefined,
  filename: string,
): boolean {
  const given = title?.trim();
  if (!given) return false;
  return given === filename.trim() || given === fileNameStem(filename);
}

/**
 * The title an uploaded file is saved under: the title the user gave, else
 * the first `#` heading of its Markdown text, else its file name without the
 * extension. A given title that only repeats the file name counts as none.
 */
export function uploadTitle(input: {
  title?: string | undefined;
  filename: string;
  markdown?: string | undefined;
}): string {
  const given = input.title?.trim();
  if (given && !repeatsUploadFileName(given, input.filename)) return given;
  const heading =
    input.markdown !== undefined
      ? firstMarkdownHeading(markdownBody(input.markdown), { depth: 1 })
      : undefined;
  if (heading) return heading;
  return fileNameStem(input.filename) || input.filename;
}
