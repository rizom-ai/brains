import type { ProposalField } from "./chat-proposals";

/** A passage selected in the body when the question was asked. */
export interface AskSelection {
  from: number;
  to: number;
  text: string;
}

/** The most a connected brain is sent, as the ask-agent route accepts. */
const MAX_PEER_PASSAGE = 8_000;

/** Widgets whose value is prose an answer could propose. */
const PROSE_WIDGETS: ReadonlySet<string> = new Set(["string", "text"]);

/**
 * Starters, as the rewrite bar's presets were. Rewrite asks for the
 * replacement alone, so a connected brain's answer can replace the selection.
 */
export const ASK_STARTERS: ReadonlyArray<{
  label: string;
  instruction: string;
  rewrite: boolean;
}> = [
  { label: "Review", instruction: "Review this selection.", rewrite: false },
  {
    label: "Fact-check",
    instruction: "Fact-check this selection.",
    rewrite: false,
  },
  {
    label: "Related",
    instruction: "What related context do you know?",
    rewrite: false,
  },
  {
    label: "Rewrite",
    instruction:
      "Rewrite this selection. Return only replacement markdown without commentary.",
    rewrite: true,
  },
];

/** Whether a question asks for a rewrite, as the Rewrite starter does. */
export function asksRewrite(question: string): boolean {
  return /^rewrite\b/i.test(question.trim());
}

/**
 * The body with the selected passage replaced: where it still stands, or
 * where it now appears once. Null when it is gone or ambiguous, so a
 * replacement never lands on text the reader did not select.
 */
export function replaceSelection(
  body: string,
  selection: AskSelection,
  replacement: string,
): string | null {
  if (body.slice(selection.from, selection.to) === selection.text)
    return (
      body.slice(0, selection.from) + replacement + body.slice(selection.to)
    );
  const at = body.indexOf(selection.text);
  if (at < 0 || body.indexOf(selection.text, at + 1) >= 0) return null;
  return (
    body.slice(0, at) + replacement + body.slice(at + selection.text.length)
  );
}

/**
 * The fields an answer may propose text for: text fields, the body, and the
 * passage selected when it was asked, which stays a proposal after the
 * selection is gone.
 */
export function askFields(
  descriptors: ReadonlyArray<{
    name: string;
    label: string;
    widget: string;
    secret?: true | undefined;
  }>,
): ProposalField[] {
  return [
    ...descriptors
      .filter((field) => PROSE_WIDGETS.has(field.widget) && !field.secret)
      .map((field) => ({ name: field.name, label: field.label })),
    { name: "body", label: "Body" },
    { name: "selection", label: "Selection" },
  ];
}

/** What a connected brain is sent: the selection, or the post itself. */
export function peerPassage(
  body: string,
  selection: AskSelection | null,
): string {
  return (selection?.text ?? body).slice(0, MAX_PEER_PASSAGE);
}

/** The composer's prompt: who is asked, and about what. */
export function askPlaceholder(input: {
  who: string | null;
  selected: boolean;
  typeLabel: string;
}): string {
  const about = input.selected ? "the selection" : `this ${input.typeLabel}`;
  return input.who ? `Ask ${input.who} about ${about}…` : `Ask about ${about}…`;
}
