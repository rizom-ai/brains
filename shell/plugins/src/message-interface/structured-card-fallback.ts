import type { StructuredChatCard } from "../contracts/agent";
import { formatArtifactDisplay } from "./artifact-display";
import { formatStructuredOutputSummary } from "./confirmation-result";

export interface StructuredCardFallbackOptions {
  deniedCardIds: ReadonlySet<string> | undefined;
  resolveUrl: (url: string | undefined) => string | undefined;
  isHiddenUrl: (url: string) => boolean;
  eventActionUnavailableLabel: string | undefined;
}

export function formatStructuredCardFallback(
  card: StructuredChatCard,
  options: StructuredCardFallbackOptions,
): string {
  if (card.kind === "attachment") {
    return formatAttachmentCardFallback(card, options);
  }

  if (card.kind === "tool-approval") {
    return formatToolApprovalCardFallback(card);
  }

  if (card.kind === "sources") {
    return formatSourcesCardFallback(card, options);
  }

  return formatActionsCardFallback(card, options);
}

function formatAttachmentCardFallback(
  card: Extract<StructuredChatCard, { kind: "attachment" }>,
  options: StructuredCardFallbackOptions,
): string {
  if (options.deniedCardIds?.has(card.id)) {
    return "Artifact: Not available at your access level.";
  }

  const display = formatArtifactDisplay(card);
  if (!display) return "Artifact: Generated artifact";

  const lines = [`Artifact: ${display.title}`];
  if (display.description) lines.push(display.description);
  if (display.filename) lines.push(`File: ${display.filename}`);
  if (display.mediaType) lines.push(`Type: ${display.mediaType}`);
  if (display.sizeLabel) lines.push(`Size: ${display.sizeLabel}`);

  const previewUrl = options.resolveUrl(display.previewUrl);
  const openUrl = options.resolveUrl(display.url);
  const downloadUrl = options.resolveUrl(display.downloadUrl);
  if (previewUrl && !options.isHiddenUrl(previewUrl)) {
    lines.push(`Preview: ${previewUrl}`);
  }
  if (openUrl && !options.isHiddenUrl(openUrl)) {
    lines.push(`Open: ${openUrl}`);
  }
  if (downloadUrl && !options.isHiddenUrl(downloadUrl)) {
    lines.push(`Download: ${downloadUrl}`);
  }
  return lines.join("\n");
}

function formatToolApprovalCardFallback(
  card: Extract<StructuredChatCard, { kind: "tool-approval" }>,
): string {
  const lines = [`Approval: ${card.summary || card.toolName}`];
  lines.push(`Status: ${card.state}`);
  if (card.preview) lines.push(card.preview);
  const output = formatStructuredOutputSummary(card.output);
  if (output) lines.push(`Result: ${output}`);
  if (card.error) lines.push(`Error: ${card.error}`);
  return lines.join("\n");
}

function formatSourcesCardFallback(
  card: Extract<StructuredChatCard, { kind: "sources" }>,
  options: StructuredCardFallbackOptions,
): string {
  const lines = [`Sources: ${card.title ?? "Retrieved context"}`];
  for (const source of card.sources) {
    const resolvedUrl = options.resolveUrl(source.url);
    const displayUrl =
      resolvedUrl && !options.isHiddenUrl(resolvedUrl)
        ? ` — ${resolvedUrl}`
        : "";
    lines.push(`- ${source.title ?? source.source}${displayUrl}`);
  }
  return lines.join("\n");
}

function formatActionsCardFallback(
  card: Extract<StructuredChatCard, { kind: "actions" }>,
  options: StructuredCardFallbackOptions,
): string {
  const lines = [`Actions: ${card.title ?? "Suggested actions"}`];
  for (const action of card.actions) {
    const unavailable =
      action.type === "event" && options.eventActionUnavailableLabel
        ? ` (${options.eventActionUnavailableLabel})`
        : "";
    lines.push(`- ${action.label}${unavailable}`);
  }
  return lines.join("\n");
}
