import { z } from "zod";
import type { FileUIPart, UIMessage } from "ai";

export const uploadEndpoint = "/api/chat/uploads";
export const defaultUploadFilename = "upload.txt";
export const uploadPartType = "data-upload";

export const webChatUploadRefSchema = z.object({
  kind: z.literal("web-chat-upload"),
  id: z.string().min(1),
});

export const webChatUploadResponseSchema = z.object({
  id: z.string().min(1),
  ref: webChatUploadRefSchema,
  filename: z.string().min(1),
  mediaType: z.string().min(1),
  sizeBytes: z.number().nonnegative(),
  createdAt: z.string().datetime(),
});

export type WebChatUploadRef = z.infer<typeof webChatUploadRefSchema>;
export type WebChatUploadResponse = z.infer<typeof webChatUploadResponseSchema>;
export type UploadFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
export type UploadFilePart = (
  file: FileUIPart,
) => Promise<WebChatUploadResponse>;

export interface PreparedUploadSubmission {
  uploadedFiles: WebChatUploadResponse[];
  payload: { text: string } | { parts: UIMessage["parts"] };
  title: string;
  uploadNoticeMessage: string | null;
}

export interface WebChatUploadPart {
  type: typeof uploadPartType;
  data: WebChatUploadResponse;
}

export function getFileUploadName(file: FileUIPart): string {
  return file.filename ?? defaultUploadFilename;
}

export function parseUploadPartData(
  data: unknown,
): WebChatUploadResponse | null {
  const parsed = webChatUploadResponseSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export function createUploadPart(
  upload: WebChatUploadResponse,
): WebChatUploadPart {
  return {
    type: uploadPartType,
    data: upload,
  };
}

export function createUploadMessageParts(
  text: string,
  uploads: WebChatUploadResponse[],
): UIMessage["parts"] {
  const parts: UIMessage["parts"] = [];
  if (text.length > 0) {
    parts.push({ type: "text", text });
  }
  for (const upload of uploads) {
    parts.push(createUploadPart(upload));
  }
  return parts;
}

export async function prepareUploadSubmission(
  text: string,
  files: FileUIPart[],
  upload: UploadFilePart = uploadFilePart,
): Promise<PreparedUploadSubmission> {
  const uploadedFiles = await Promise.all(files.map((file) => upload(file)));
  const payload =
    uploadedFiles.length > 0
      ? { parts: createUploadMessageParts(text, uploadedFiles) }
      : { text };
  return {
    uploadedFiles,
    payload,
    title: text ? text : (uploadedFiles.at(0)?.filename ?? "Uploaded file"),
    uploadNoticeMessage:
      uploadedFiles.length > 0
        ? `Sent ${uploadedFiles.length === 1 ? "attachment" : "attachments"}: ${uploadedFiles
            .map((file) => file.filename)
            .join(", ")}`
        : null,
  };
}

export async function uploadFilePart(
  file: FileUIPart,
  fetchFn: UploadFetch = fetch,
): Promise<WebChatUploadResponse> {
  const filename = getFileUploadName(file);
  const blobResponse = await fetchFn(file.url);
  if (!blobResponse.ok) {
    throw new Error(`Could not read attachment: ${filename}`);
  }

  const blob = await blobResponse.blob();
  const form = new FormData();
  form.set(
    "file",
    new File([blob], filename, {
      type: file.mediaType || blob.type || "application/octet-stream",
    }),
  );

  const uploadResponse = await fetchFn(uploadEndpoint, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!uploadResponse.ok) {
    throw new Error(await uploadResponse.text());
  }

  const parsed = webChatUploadResponseSchema.safeParse(
    await uploadResponse.json(),
  );
  if (!parsed.success) {
    throw new Error("Invalid upload response");
  }
  return parsed.data;
}
