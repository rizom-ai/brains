import { extractPdfMarkdown } from "@brains/document";
import type { ResolvedRuntimeUpload } from "@brains/plugins";
import { slugify } from "@brains/utils";

const textUploadMediaTypes = new Set([
  "text/plain",
  "text/markdown",
  "text/x-markdown",
]);

export interface MarkdownImportResult {
  id: string;
  title: string;
  content: string;
}

export async function extractMarkdownFromUpload(input: {
  upload: ResolvedRuntimeUpload;
  title?: string;
}): Promise<MarkdownImportResult> {
  const title = getUploadTitle(input.title, input.upload.record.filename);
  const id = slugify(title);
  if (!id) {
    throw new Error(
      "Could not derive a note id from the uploaded filename. Provide a title.",
    );
  }

  const markdown = await readUploadMarkdown(input.upload);
  return {
    id,
    title,
    content: withTitleFrontmatter(title, markdown),
  };
}

async function readUploadMarkdown(
  upload: ResolvedRuntimeUpload,
): Promise<string> {
  const mediaType = upload.record.mediaType.toLowerCase();
  if (mediaType === "application/pdf") {
    return extractPdfMarkdown(upload.content);
  }

  if (textUploadMediaTypes.has(mediaType)) {
    return upload.content.toString("utf8");
  }

  throw new Error(
    "Only text and PDF uploads can be imported as markdown notes",
  );
}

function getUploadTitle(title: string | undefined, filename: string): string {
  const trimmed = title?.trim();
  if (trimmed) return trimmed;
  const withoutExt = filename.replace(/\.[^.]+$/, "").trim();
  return withoutExt || filename;
}

function withTitleFrontmatter(title: string, markdown: string): string {
  return `---\ntitle: ${JSON.stringify(title)}\n---\n\n${markdown.trim()}\n`;
}
