import type { StructuredChatCard } from "../contracts/agent";
import { isRecord } from "@brains/utils/is-record";
import { runtimeUploadIdSource } from "../service/upload-registry";

/**
 * Every upload id in a value, found by the format the upload registry mints,
 * so no argument or result shape can carry one past redaction.
 */
export function redactUploadRefs(value: unknown): unknown {
  if (typeof value === "string")
    return value.replace(
      new RegExp(runtimeUploadIdSource, "gi"),
      "uploaded file",
    );
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
