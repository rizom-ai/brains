import type { ChatAttachment } from "./chat-context";

/** Whether an attachment is a PDF, whatever the case of its media type. */
export function isPdfAttachment(attachment: ChatAttachment): boolean {
  return attachment.mediaType.toLowerCase() === "application/pdf";
}
