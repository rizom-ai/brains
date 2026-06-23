import type { StructuredChatCard } from "@brains/plugins";
import { z } from "@brains/utils/zod-v4";
import type { UIMessage, UIMessageStreamWriter } from "ai";

const recordSchema = z.record(z.string(), z.unknown());
type ParsedRecord = z.output<typeof recordSchema>;

const uploadRefSchema = z.looseObject({
  kind: z.literal("upload"),
  id: z.string(),
});

function parseRecord(value: unknown): ParsedRecord | undefined {
  const parsed = recordSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function isUploadRef(value: unknown): boolean {
  return uploadRefSchema.safeParse(value).success;
}

export function redactUploadRefs(value: unknown): unknown {
  if (isUploadRef(value)) return "uploaded file";
  if (Array.isArray(value)) return value.map((item) => redactUploadRefs(item));
  const record = parseRecord(value);
  if (!record) return value;
  return redactUploadRefsInRecord(record);
}

function redactUploadRefsInRecord(value: ParsedRecord): ParsedRecord {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, redactUploadRefs(entry)]),
  );
}

function redactToolApprovalCard(card: StructuredChatCard): StructuredChatCard {
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

export function writeTextPart(
  writer: UIMessageStreamWriter<UIMessage>,
  id: string,
  text: string,
): void {
  writer.write({ type: "text-start", id });
  writer.write({ type: "text-delta", id, delta: text });
  writer.write({ type: "text-end", id });
}

export function writeStructuredCards(
  writer: UIMessageStreamWriter<UIMessage>,
  cards: StructuredChatCard[],
): void {
  for (const rawCard of cards) {
    const card = redactToolApprovalCard(rawCard);
    if (card.kind === "attachment") {
      writer.write({
        type: "data-attachment",
        id: card.id,
        data: card,
      });
      continue;
    }

    if (card.kind === "sources") {
      writer.write({
        type: "data-sources",
        id: card.id,
        data: card,
      });
      continue;
    }

    if (card.kind === "actions") {
      writer.write({
        type: "data-actions",
        id: card.id,
        data: card,
      });
      continue;
    }

    const toolCallId = card.toolCallId ?? card.id;
    const input = card.input ?? {};
    writer.write({
      type: "tool-input-available",
      toolCallId,
      toolName: card.toolName,
      input,
      dynamic: true,
      title: card.preview ? `${card.summary}\n\n${card.preview}` : card.summary,
    });
    switch (card.state) {
      case "approval-requested":
        writer.write({
          type: "tool-approval-request",
          approvalId: card.id,
          toolCallId,
        });
        break;
      case "approval-responded":
        // Agent skips this state — it transitions directly from
        // approval-requested to one of the output-* states.
        break;
      case "output-available":
        writer.write({
          type: "tool-output-available",
          toolCallId,
          output: card.output,
          dynamic: true,
        });
        break;
      case "output-error":
        writer.write({
          type: "tool-output-error",
          toolCallId,
          errorText: card.error ?? "Tool failed",
          dynamic: true,
        });
        break;
      case "output-denied":
        writer.write({
          type: "tool-output-denied",
          toolCallId,
        });
        break;
    }
  }
}
