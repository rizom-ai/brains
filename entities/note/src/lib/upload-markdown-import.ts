import { withUploadMarkdown } from "@brains/document";
import type { RuntimeUploadRecord, EntityPluginContext } from "@brains/plugins";
import { slugify } from "@brains/utils/string-utils";

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

export async function withMarkdownFromUpload<T>(
  input: {
    upload: { record: RuntimeUploadRecord; sourceFile: string };
    files: NonNullable<EntityPluginContext["entityService"]["fileAssets"]>;
    signal: AbortSignal;
    title?: string;
  },
  use: (result: MarkdownImportResult, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const { id, title } = getMarkdownImportIdentity({
    filename: input.upload.record.filename,
    ...(input.title !== undefined ? { title: input.title } : {}),
  });

  const mediaType = input.upload.record.mediaType.toLowerCase();
  if (!isSupportedMarkdownUploadMediaType(mediaType))
    throw new Error(
      "Only text, JSON, and PDF uploads can be imported as markdown notes",
    );
  return withUploadMarkdown(
    input.files,
    {
      sourceFile: input.upload.sourceFile,
      sizeBytes: input.upload.record.sizeBytes,
      mediaType,
    },
    async (markdown, signal): Promise<T> =>
      use(
        { id, title, content: withTitleFrontmatter(title, markdown) },
        signal,
      ),
    { signal: input.signal },
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
