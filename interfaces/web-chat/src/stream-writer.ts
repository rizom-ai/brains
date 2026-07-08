import {
  redactUploadRefsInStructuredCard,
  type ResponsePlan,
  type StructuredChatCard,
} from "@brains/plugins";
import type { UIMessage, UIMessageStreamWriter } from "ai";

export function writeTextPart(
  writer: UIMessageStreamWriter<UIMessage>,
  id: string,
  text: string,
): void {
  writer.write({ type: "text-start", id });
  writer.write({ type: "text-delta", id, delta: text });
  writer.write({ type: "text-end", id });
}

/**
 * Stream the card directives of a response plan. Text is written by the
 * caller (it needs display stripping); denied artifacts are not exposed
 * at all — not even their card metadata — matching the discrete-message
 * interfaces. Approval-requested cards stream from the approvals
 * directive, which is web-chat's approval UX.
 */
export function writePlanCards(
  writer: UIMessageStreamWriter<UIMessage>,
  plan: ResponsePlan,
): void {
  const cards = plan.directives.flatMap((directive): StructuredChatCard[] => {
    switch (directive.kind) {
      case "artifact":
      case "supplemental":
        return [directive.card];
      case "approvals":
        return directive.cards;
      default:
        return [];
    }
  });
  for (const rawCard of cards) {
    const card = redactUploadRefsInStructuredCard(rawCard);
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
