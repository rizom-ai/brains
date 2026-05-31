export const defaultWebChatUploadFilename = "upload.txt";
export const webChatTextUploadAccept =
  ".md,.txt,.markdown,text/plain,text/markdown,text/x-markdown";
export const webChatTextUploadMaxBytes = 100_000;

const textFileExtensions = [".md", ".txt", ".markdown"];
const textMimeTypes = ["text/plain", "text/markdown", "text/x-markdown"];

export type WebChatUploadPolicyErrorCode =
  | "unsupported_type"
  | "file_too_large"
  | "binary_content";

export interface ValidatedTextUpload {
  ok: true;
  filename: string;
  mediaType: string;
  sizeBytes: number;
  text: string;
}

export interface InvalidTextUpload {
  ok: false;
  code: WebChatUploadPolicyErrorCode;
  message: string;
}

export type TextUploadValidationResult =
  | ValidatedTextUpload
  | InvalidTextUpload;

export interface ValidateTextUploadInput {
  filename: string;
  mediaType: string | undefined;
  content: Uint8Array;
}

export function sanitizeUploadFilename(filename: string): string {
  const leaf = filename.split(/[\\/]/).at(-1)?.trim() ?? "";
  const cleaned = Array.from(leaf)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .slice(0, 160);
  return cleaned.length > 0 ? cleaned : defaultWebChatUploadFilename;
}

export function normalizeTextUploadMediaType(
  filename: string,
  mediaType: string | undefined,
): string {
  const trimmed = mediaType?.trim() ?? "";
  if (trimmed.length > 0) return trimmed;

  const lowerFilename = filename.toLowerCase();
  if (lowerFilename.endsWith(".md") || lowerFilename.endsWith(".markdown")) {
    return "text/markdown";
  }
  if (lowerFilename.endsWith(".txt")) {
    return "text/plain";
  }
  return "application/octet-stream";
}

export function isUploadableTextFile(
  filename: string,
  mediaType: string | undefined,
): boolean {
  if (
    mediaType &&
    textMimeTypes.some((type) => mediaType.toLowerCase().startsWith(type))
  ) {
    return true;
  }
  return textFileExtensions.some((extension) =>
    filename.toLowerCase().endsWith(extension),
  );
}

export function isTextUploadSizeAllowed(sizeBytes: number): boolean {
  return sizeBytes <= webChatTextUploadMaxBytes;
}

export function isLikelyUtf8Text(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export function validateTextUpload(
  input: ValidateTextUploadInput,
): TextUploadValidationResult {
  const filename = sanitizeUploadFilename(input.filename);
  const mediaType = normalizeTextUploadMediaType(filename, input.mediaType);
  if (!isUploadableTextFile(filename, mediaType)) {
    return {
      ok: false,
      code: "unsupported_type",
      message: `Unsupported file upload type: ${filename}`,
    };
  }

  if (!isTextUploadSizeAllowed(input.content.byteLength)) {
    return {
      ok: false,
      code: "file_too_large",
      message: `File upload too large: ${filename}`,
    };
  }

  if (!isLikelyUtf8Text(input.content)) {
    return {
      ok: false,
      code: "binary_content",
      message: `Unsupported file upload type: ${filename}`,
    };
  }

  return {
    ok: true,
    filename,
    mediaType,
    sizeBytes: input.content.byteLength,
    text: new TextDecoder("utf-8").decode(input.content).replace(/^\uFEFF/, ""),
  };
}
