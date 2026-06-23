export interface NamedAttachmentReference {
  filename: string;
}

/**
 * Select prior attachments referenced by a natural-language follow-up.
 *
 * Filename mentions win over ordinal/recency wording so explicit user intent is
 * deterministic even when the sentence also says "latest" or "first".
 */
export function selectReferencedAttachments<T extends NamedAttachmentReference>(
  message: string,
  attachments: readonly T[],
): T[] {
  if (attachments.length === 0) return [];

  const normalized = message.toLowerCase();
  const named = attachments.filter((attachment) =>
    normalized.includes(attachment.filename.toLowerCase()),
  );
  if (named.length > 0) return named;

  if (/\b(first|oldest|earliest)\b/.test(normalized)) {
    return attachments.slice(0, 1);
  }
  if (/\b(latest|newest|most recent|last)\b/.test(normalized)) {
    return attachments.slice(-1);
  }
  return [...attachments];
}
