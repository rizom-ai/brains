import type { StructuredChatCard } from "../contracts/agent";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUploadRef(value: unknown): boolean {
  return (
    isRecord(value) &&
    value["kind"] === "upload" &&
    typeof value["id"] === "string"
  );
}

export function redactUploadRefs(value: unknown): unknown {
  if (isUploadRef(value)) return "uploaded file";
  if (Array.isArray(value)) return value.map((item) => redactUploadRefs(item));
  if (!isRecord(value)) return value;
  return redactUploadRefsInRecord(value);
}

export function redactUploadRefsInRecord(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, redactUploadRefs(entry)]),
  );
}

export function redactUploadRefsInStructuredCard(
  card: StructuredChatCard,
): StructuredChatCard {
  if (card.kind !== "tool-approval") return card;
  return {
    ...card,
    ...(card.input !== undefined
      ? { input: redactUploadRefsInRecord(card.input) }
      : {}),
    ...(card.output !== undefined
      ? { output: redactUploadRefs(card.output) }
      : {}),
  };
}
