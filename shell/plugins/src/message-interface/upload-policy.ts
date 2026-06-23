export const defaultMessageUploadFilename = "upload.txt";
export const messageTextUploadAccept =
  ".md,.txt,.markdown,text/plain,text/markdown,text/x-markdown";
export const messageBinaryUploadAccept =
  ".png,.jpg,.jpeg,.webp,.gif,.pdf,image/png,image/jpeg,image/webp,image/gif,application/pdf";
export const messageUploadAccept =
  ".md,.txt,.markdown,.png,.jpg,.jpeg,.webp,.gif,.pdf,text/plain,text/markdown,text/x-markdown,image/png,image/jpeg,image/webp,image/gif,application/pdf";
export const messageTextUploadMaxBytes = 100_000;
export const messageUploadMaxBytes = 5_000_000;

const textFileExtensions = [".md", ".txt", ".markdown"];
const textMimeTypes = ["text/plain", "text/markdown", "text/x-markdown"];
const binaryFileExtensionMediaTypes = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".pdf", "application/pdf"],
]);
const binaryMimeTypes = new Set(binaryFileExtensionMediaTypes.values());

export type MessageUploadPolicyErrorCode =
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

export interface ValidatedFileUpload {
  ok: true;
  kind: "file";
  filename: string;
  mediaType: string;
  sizeBytes: number;
}

export interface InvalidUpload {
  ok: false;
  code: MessageUploadPolicyErrorCode;
  message: string;
}

export type TextUploadValidationResult = ValidatedTextUpload | InvalidUpload;

export type ValidatedMessageUpload =
  | (ValidatedTextUpload & { kind: "text" })
  | ValidatedFileUpload;

export type MessageUploadValidationResult =
  | ValidatedMessageUpload
  | InvalidUpload;

export interface ValidateUploadInput {
  filename: string;
  mediaType: string | undefined;
  content: Uint8Array;
  fallbackFilename?: string | undefined;
}

export function sanitizeUploadFilename(
  filename: string,
  fallbackFilename = defaultMessageUploadFilename,
): string {
  const leaf = filename.split(/[\\/]/).at(-1)?.trim() ?? "";
  const cleaned = Array.from(leaf)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .slice(0, 160);
  return cleaned.length > 0 ? cleaned : fallbackFilename;
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

export function normalizeMessageUploadMediaType(
  filename: string,
  mediaType: string | undefined,
): string {
  const trimmed = mediaType?.trim() ?? "";
  const explicitMediaType = trimmed.split(";", 1)[0]?.toLowerCase() ?? trimmed;
  if (
    explicitMediaType.length > 0 &&
    explicitMediaType !== "application/octet-stream"
  ) {
    return explicitMediaType;
  }

  const textMediaType = normalizeTextUploadMediaType(filename, undefined);
  if (textMediaType !== "application/octet-stream") return textMediaType;

  const lowerFilename = filename.toLowerCase();
  for (const [extension, extensionMediaType] of binaryFileExtensionMediaTypes) {
    if (lowerFilename.endsWith(extension)) return extensionMediaType;
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
  return sizeBytes <= messageTextUploadMaxBytes;
}

export function isMessageUploadSizeAllowed(sizeBytes: number): boolean {
  return sizeBytes <= messageUploadMaxBytes;
}

export function isUploadableBinaryFile(
  filename: string,
  mediaType: string | undefined,
): boolean {
  const normalizedMediaType = normalizeMessageUploadMediaType(
    filename,
    mediaType,
  );
  if (binaryMimeTypes.has(normalizedMediaType)) return true;

  return binaryFileExtensionMediaTypes.has(getLowercaseExtension(filename));
}

export function getMessageUploadKind(
  filename: string,
  mediaType: string | undefined,
): "text" | "file" | undefined {
  const normalizedMediaType = normalizeMessageUploadMediaType(
    filename,
    mediaType,
  );
  if (isUploadableTextFile(filename, normalizedMediaType)) return "text";
  if (isUploadableBinaryFile(filename, normalizedMediaType)) return "file";
  return undefined;
}

export function isMessageUploadDeclaredSizeAllowed(
  uploadKind: "text" | "file",
  sizeBytes: number,
): boolean {
  if (sizeBytes <= 0) return true;
  return uploadKind === "text"
    ? isTextUploadSizeAllowed(sizeBytes)
    : isMessageUploadSizeAllowed(sizeBytes);
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
  input: ValidateUploadInput,
): TextUploadValidationResult {
  const filename = sanitizeUploadFilename(
    input.filename,
    input.fallbackFilename,
  );
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

export function validateMessageUpload(
  input: ValidateUploadInput,
): MessageUploadValidationResult {
  const filename = sanitizeUploadFilename(
    input.filename,
    input.fallbackFilename,
  );
  const mediaType = normalizeMessageUploadMediaType(filename, input.mediaType);

  if (isUploadableTextFile(filename, mediaType)) {
    const textUpload = validateTextUpload({
      filename,
      mediaType,
      content: input.content,
      ...(input.fallbackFilename !== undefined && {
        fallbackFilename: input.fallbackFilename,
      }),
    });
    return textUpload.ok ? { ...textUpload, kind: "text" } : textUpload;
  }

  if (!isUploadableBinaryFile(filename, mediaType)) {
    return {
      ok: false,
      code: "unsupported_type",
      message: `Unsupported file upload type: ${filename}`,
    };
  }

  if (!isMessageUploadSizeAllowed(input.content.byteLength)) {
    return {
      ok: false,
      code: "file_too_large",
      message: `File upload too large: ${filename}`,
    };
  }

  if (!hasExpectedBinarySignature(input.content, mediaType)) {
    return {
      ok: false,
      code: "unsupported_type",
      message: `Unsupported file upload type: ${filename}`,
    };
  }

  return {
    ok: true,
    kind: "file",
    filename,
    mediaType,
    sizeBytes: input.content.byteLength,
  };
}

function getLowercaseExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";
}

function hasExpectedBinarySignature(
  bytes: Uint8Array,
  mediaType: string,
): boolean {
  switch (mediaType) {
    case "image/png":
      return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47]);
    case "image/jpeg":
      return startsWithBytes(bytes, [0xff, 0xd8, 0xff]);
    case "image/gif":
      return (
        startsWithAscii(bytes, "GIF87a") || startsWithAscii(bytes, "GIF89a")
      );
    case "image/webp":
      return startsWithAscii(bytes, "RIFF") && hasAsciiAt(bytes, "WEBP", 8);
    case "application/pdf":
      return startsWithAscii(bytes, "%PDF-");
    default:
      return false;
  }
}

function startsWithBytes(bytes: Uint8Array, expected: number[]): boolean {
  return expected.every((byte, index) => bytes[index] === byte);
}

function startsWithAscii(bytes: Uint8Array, expected: string): boolean {
  return hasAsciiAt(bytes, expected, 0);
}

function hasAsciiAt(
  bytes: Uint8Array,
  expected: string,
  offset: number,
): boolean {
  return Array.from(expected).every(
    (char, index) => bytes[offset + index] === char.charCodeAt(0),
  );
}
