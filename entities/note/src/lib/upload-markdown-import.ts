import { extractPdfMarkdown } from "@brains/document";
import {
  isTextUploadMediaType,
  uploadTitle,
  type ResolvedRuntimeUpload,
} from "@brains/plugins";
import { generateMarkdown } from "@brains/utils/markdown";
import { slugify } from "@brains/utils/string-utils";

export function isSupportedMarkdownUploadMediaType(mediaType: string): boolean {
  return (
    mediaType.toLowerCase() === "application/pdf" ||
    isTextUploadMediaType(mediaType)
  );
}

/**
 * The note an upload is imported as: the title the caller gave, else the
 * upload's first # heading, else its file name; and the id from that title.
 */
export function getMarkdownImportIdentity(input: {
  filename: string;
  title?: string | undefined;
  markdown?: string | undefined;
}): { id: string; title: string } {
  const title = uploadTitle(input);
  const id = slugify(title);
  if (!id) {
    throw new Error(
      "Could not derive a note id from the uploaded filename. Provide a title.",
    );
  }
  return { id, title };
}

export interface MarkdownImportResult {
  id: string;
  title: string;
  content: string;
}

export async function extractMarkdownFromUpload(input: {
  upload: ResolvedRuntimeUpload;
  title?: string;
}): Promise<MarkdownImportResult> {
  const markdown = await readUploadMarkdown(input.upload);
  const { id, title } = getMarkdownImportIdentity({
    filename: input.upload.record.filename,
    title: input.title,
    markdown,
  });

  return {
    id,
    title,
    content: withTitleFrontmatter(title, markdown),
  };
}

/** A text upload's Markdown, read without extracting anything. */
export function readTextUploadMarkdown(
  upload: ResolvedRuntimeUpload,
): string | undefined {
  return isTextUploadMediaType(upload.record.mediaType)
    ? upload.content.toString("utf8")
    : undefined;
}

async function readUploadMarkdown(
  upload: ResolvedRuntimeUpload,
): Promise<string> {
  if (upload.record.mediaType.toLowerCase() === "application/pdf") {
    return extractPdfMarkdown(upload.content);
  }

  const text = readTextUploadMarkdown(upload);
  if (text !== undefined) return text;

  throw new Error(
    "Only text, JSON, and PDF uploads can be imported as markdown notes",
  );
}

/** Set the note's title in the upload's own frontmatter, or in a new block. */
function withTitleFrontmatter(title: string, markdown: string): string {
  const trimmed = markdown.trim();
  try {
    return generateMarkdown({ title }, trimmed);
  } catch {
    // Frontmatter that does not parse stays in the body as text.
    return `---\ntitle: ${JSON.stringify(title)}\n---\n\n${trimmed}\n`;
  }
}
