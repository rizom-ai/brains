import { extractPdfMarkdown } from "@brains/document";
import { getErrorMessage } from "@brains/utils/error";
import type { FilePart, ModelMessage, TextPart } from "ai";

/**
 * The messages a model that reads only text can take: each uploaded file
 * becomes text, a PDF its extracted text and any other file its name and
 * type, so the model still knows what was uploaded and can save it by its
 * upload reference.
 */
export async function textOnlyMessages(
  messages: ModelMessage[],
): Promise<ModelMessage[]> {
  return Promise.all(
    messages.map(async (message) => {
      if (message.role !== "user" || typeof message.content === "string")
        return message;
      const content = await Promise.all(
        message.content.map(async (part) =>
          part.type === "file" ? describeFile(part) : part,
        ),
      );
      return { ...message, content };
    }),
  );
}

async function describeFile(part: FilePart): Promise<TextPart> {
  const name = `"${part.filename ?? "an unnamed file"}"`;
  if (part.mediaType.toLowerCase() !== "application/pdf") {
    return {
      type: "text",
      text: `User uploaded a file ${name} (${part.mediaType}). Its contents are not shown to you.`,
    };
  }
  const data = fileBytes(part.data);
  if (!data) {
    return {
      type: "text",
      text: `User uploaded a PDF ${name}. Its text is not shown to you.`,
    };
  }
  try {
    return {
      type: "text",
      text: `User uploaded a PDF ${name}. Its text:\n\n${await extractPdfMarkdown(data)}`,
    };
  } catch (error) {
    return {
      type: "text",
      text: `User uploaded a PDF ${name}. Its text could not be read: ${getErrorMessage(error)}`,
    };
  }
}

function fileBytes(data: FilePart["data"]): Buffer | undefined {
  if (typeof data === "string") return Buffer.from(data, "base64");
  if (data instanceof URL) return undefined;
  return Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
}
