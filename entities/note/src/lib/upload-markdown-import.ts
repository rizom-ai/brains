import { extractPdfMarkdown } from "@brains/document";
import type { ResolvedRuntimeUpload } from "@brains/plugins";
import { slugify } from "@brains/utils";

const textUploadMediaTypes = new Set([
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/json",
]);

export function isSupportedMarkdownUploadMediaType(mediaType: string): boolean {
  const normalized = mediaType.toLowerCase();
  return (
    normalized === "application/pdf" || textUploadMediaTypes.has(normalized)
  );
}

export function getMarkdownImportIdentity(input: {
  filename: string;
  title?: string;
}): { id: string; title: string } {
  const title = getUploadTitle(input.title, input.filename);
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
  const { id, title } = getMarkdownImportIdentity({
    filename: input.upload.record.filename,
    ...(input.title !== undefined ? { title: input.title } : {}),
  });

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
    "Only text, JSON, and PDF uploads can be imported as markdown notes",
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
