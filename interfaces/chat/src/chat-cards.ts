import type { CardChild, CardElement } from "chat";
import type { formatArtifactDisplay } from "@brains/plugins";
import {
  formatStructuredCardFallback,
  formatStructuredOutputSummary,
  formatToolStatusLabel,
  type PendingConfirmation,
  type StructuredChatCard,
} from "@brains/plugins";

// Action ids shared with ChatInterface (it registers handlers / matches button
// presses against these). Exported so the interface imports them from the
// presentation layer rather than the reverse.
export const APPROVAL_CONFIRM_ACTION = "approval.confirm";
export const APPROVAL_CANCEL_ACTION = "approval.cancel";
export const PROMPT_ACTION = "chat.prompt";
const UNAVAILABLE_EVENT_ACTION = "chat.event.unavailable";

const DISCORD_ACTION_ROW_LIMIT = 5;
const DISCORD_BUTTONS_PER_ROW_LIMIT = 5;
const DISCORD_CARD_BUTTON_LIMIT =
  DISCORD_ACTION_ROW_LIMIT * DISCORD_BUTTONS_PER_ROW_LIMIT;
const DISCORD_BUTTON_LABEL_LIMIT = 80;

type ArtifactDisplay = NonNullable<ReturnType<typeof formatArtifactDisplay>>;
interface LinkButton {
  type: "link-button";
  label: string;
  url: string;
}

export interface ChatCardBuilderDeps {
  /** Resolve the preferred display base URL (from interface context) at render time. */
  getDisplayBaseUrl: () => string | undefined;
  /** Register a prompt action and return its token (caller owns the action store). */
  registerPromptAction: (
    threadId: string,
    action: { label: string; prompt: string },
  ) => string;
}

/**
 * Pure presentation layer for ChatInterface: turns AgentResponse data and
 * structured cards into Discord CardElement objects. Holds no interface state.
 * URL resolution and prompt-action registration are injected so this stays a
 * testable presentation unit, decoupled from delivery and plugin plumbing.
 */
export class ChatCardBuilder {
  constructor(private readonly deps: ChatCardBuilderDeps) {}

  buildSupplementalCard(
    threadId: string,
    card: StructuredChatCard,
  ): CardElement | undefined {
    switch (card.kind) {
      case "attachment":
        return undefined;
      case "tool-approval":
        return this.buildToolApprovalSummaryCard(card);
      case "sources":
        return this.buildSourcesSummaryCard(card);
      case "actions":
        return this.buildActionsSummaryCard(threadId, card);
    }
  }

  buildToolApprovalSummaryCard(
    card: Extract<StructuredChatCard, { kind: "tool-approval" }>,
  ): CardElement {
    const children: CardChild[] = [
      {
        type: "text",
        content: card.summary || formatToolStatusLabel(card.toolName),
      },
      { type: "text", content: `Status: ${card.state}` },
    ];
    if (card.preview) children.push({ type: "text", content: card.preview });
    const output = formatStructuredOutputSummary(card.output);
    if (output) children.push({ type: "text", content: `Result: ${output}` });
    if (card.error)
      children.push({ type: "text", content: `Error: ${card.error}` });
    return {
      type: "card",
      title:
        card.state === "approval-requested"
          ? "Approval required"
          : "Approval status",
      children,
    };
  }

  buildSourcesSummaryCard(
    card: Extract<StructuredChatCard, { kind: "sources" }>,
  ): CardElement {
    const children: CardChild[] = card.sources.map((source) => ({
      type: "text" as const,
      content: source.title ?? source.source,
    }));
    const linkButtons = card.sources
      .map((source, index) =>
        this.buildSourceLinkButton(
          card.sources.length === 1 ? "Open source" : `Open ${index + 1}`,
          source.url,
        ),
      )
      .filter((button): button is LinkButton => Boolean(button))
      .slice(0, DISCORD_CARD_BUTTON_LIMIT);
    if (linkButtons.length > 0) {
      children.push({ type: "actions", children: linkButtons });
    }
    return {
      type: "card",
      title: card.title ?? "Sources",
      children,
    };
  }

  buildActionsSummaryCard(
    threadId: string,
    card: Extract<StructuredChatCard, { kind: "actions" }>,
  ): CardElement {
    const children: CardChild[] = card.actions.map((action) => ({
      type: "text" as const,
      content: this.formatActionCardText(action),
    }));
    const buttons: Array<{
      type: "button";
      id: string;
      label: string;
      value: string;
      disabled?: boolean;
    }> = [];
    for (const action of card.actions) {
      if (buttons.length >= DISCORD_CARD_BUTTON_LIMIT) break;
      if (action.type === "prompt") {
        const token = this.deps.registerPromptAction(threadId, {
          label: action.label,
          prompt: action.prompt,
        });
        buttons.push({
          type: "button",
          id: PROMPT_ACTION,
          label: this.truncateDiscordButtonLabel(action.label),
          value: token,
        });
        continue;
      }
      buttons.push({
        type: "button",
        id: UNAVAILABLE_EVENT_ACTION,
        label: this.truncateDiscordButtonLabel(action.label),
        value: action.event,
        disabled: true,
      });
    }
    if (buttons.length > 0) {
      children.push({ type: "actions", children: buttons });
    }
    return {
      type: "card",
      title: card.title ?? "Suggested actions",
      children,
    };
  }

  buildArtifactCard(display: ArtifactDisplay): CardElement {
    const children: CardChild[] = [];
    if (display.description) {
      children.push({ type: "text", content: display.description });
    }

    const fields = [
      display.filename
        ? { type: "field" as const, label: "File", value: display.filename }
        : undefined,
      display.mediaType
        ? { type: "field" as const, label: "Type", value: display.mediaType }
        : undefined,
      display.sizeLabel
        ? { type: "field" as const, label: "Size", value: display.sizeLabel }
        : undefined,
    ].filter(
      (field): field is { type: "field"; label: string; value: string } =>
        Boolean(field),
    );
    if (fields.length > 0) children.push({ type: "fields", children: fields });

    const actions = [
      this.buildArtifactLinkButton("Preview", display.previewUrl),
      this.buildArtifactLinkButton("Open", display.url),
      this.buildArtifactLinkButton("Download", display.downloadUrl),
    ].filter((button): button is LinkButton => Boolean(button));
    if (actions.length > 0)
      children.push({ type: "actions", children: actions });

    return {
      type: "card",
      title: display.title,
      children,
    };
  }

  formatArtifactFallback(display: ArtifactDisplay): string {
    const lines = [`Artifact: ${display.title}`];
    if (display.description) lines.push(display.description);
    if (display.filename) lines.push(`File: ${display.filename}`);
    if (display.mediaType) lines.push(`Type: ${display.mediaType}`);
    if (display.sizeLabel) lines.push(`Size: ${display.sizeLabel}`);
    return lines.join("\n");
  }

  buildPendingConfirmationsCard(
    pendingConfirmations: PendingConfirmation[],
  ): CardElement {
    return {
      type: "card",
      title: "Approvals pending",
      children: [
        ...pendingConfirmations.map((confirmation) => ({
          type: "text" as const,
          content: `${confirmation.id}: ${confirmation.summary}`,
        })),
        {
          type: "text",
          content:
            "Reply yes <approval-id> to confirm one item, or no <approval-id> to abort it.",
        },
      ],
    };
  }

  buildPendingConfirmationCard(confirmation: PendingConfirmation): CardElement {
    const children: CardChild[] = [
      { type: "text", content: confirmation.summary },
      {
        type: "text",
        content:
          "Confirm this action, or cancel it. You can also reply yes/no.",
      },
      {
        type: "actions",
        children: [
          {
            type: "button",
            id: APPROVAL_CONFIRM_ACTION,
            label: "Confirm",
            style: "primary",
            value: confirmation.id,
          },
          {
            type: "button",
            id: APPROVAL_CANCEL_ACTION,
            label: "Cancel",
            style: "danger",
            value: confirmation.id,
          },
        ],
      },
    ];
    return { type: "card", title: "Approval required", children };
  }

  buildResolvedApprovalCard(summary: string, confirmed: boolean): CardElement {
    return {
      type: "card",
      title: confirmed ? "Approval confirmed" : "Approval cancelled",
      children: [
        { type: "text", content: summary },
        {
          type: "text",
          content: confirmed
            ? "This action was confirmed."
            : "This action was cancelled.",
        },
      ],
    };
  }

  formatStructuredCard(
    card: StructuredChatCard,
    deniedCardIds?: Set<string>,
  ): string {
    return formatStructuredCardFallback(card, {
      deniedCardIds,
      resolveUrl: (url): string | undefined => this.resolveDisplayUrl(url),
      isHiddenUrl: (url): boolean => this.isLocalDisplayUrl(url),
      eventActionUnavailableLabel: "not available in Discord",
    });
  }

  private buildSourceLinkButton(
    label: string,
    url: string | undefined,
  ): LinkButton | undefined {
    const resolvedUrl = this.resolveDisplayUrl(url);
    if (!resolvedUrl || this.isLocalDisplayUrl(resolvedUrl)) return undefined;
    return {
      type: "link-button",
      label: this.truncateDiscordButtonLabel(label),
      url: resolvedUrl,
    };
  }

  private buildArtifactLinkButton(
    label: string,
    url: string | undefined,
  ): LinkButton | undefined {
    const resolvedUrl = this.resolveDisplayUrl(url);
    if (!resolvedUrl || this.isLocalDisplayUrl(resolvedUrl)) return undefined;
    return { type: "link-button", label, url: resolvedUrl };
  }

  private formatActionCardText(
    action: Extract<StructuredChatCard, { kind: "actions" }>["actions"][number],
  ): string {
    const description = action.description ? ` — ${action.description}` : "";
    const unavailable =
      action.type === "event" ? " (not available in Discord)" : "";
    return `${action.label}${description}${unavailable}`;
  }

  private truncateDiscordButtonLabel(label: string): string {
    if (label.length <= DISCORD_BUTTON_LABEL_LIMIT) return label;
    return `${label.slice(0, DISCORD_BUTTON_LABEL_LIMIT - 1)}…`;
  }

  private resolveDisplayUrl(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
      return new URL(url).toString();
    } catch {
      if (!url.startsWith("/")) return url;
      const baseUrl = this.deps.getDisplayBaseUrl();
      if (!baseUrl) return url;
      return new URL(url, baseUrl).toString();
    }
  }

  private isLocalDisplayUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    } catch {
      return url.startsWith("/");
    }
  }
}
