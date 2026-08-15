import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import type {
  EmailReplyDraftAction,
  EmailReplyDraftWorkspaceSnapshot,
} from "./api";
import { EmailReplyDraftWorkspace } from "./email-reply-draft-workspace";

const data: EmailReplyDraftWorkspaceSnapshot = {
  mailItemId: `mail-${"a".repeat(64)}`,
  draft: null,
};

const source = {
  from: { name: "Alice", address: "alice@example.com" },
  subject: "Project question",
  receivedAt: "2026-08-05T09:00:00.000Z",
  text: "Could we meet next week? <script>unsafe()</script>",
  truncated: false,
};

describe("EmailReplyDraftWorkspace", () => {
  it("renders a safe standalone landing state", () => {
    const html = renderToStaticMarkup(
      createElement(EmailReplyDraftWorkspace, {
        data: { mailItemId: null, draft: null },
        onAction: async () => ({
          kind: "error" as const,
          error: "Invalid draft action" as const,
        }),
        onSource: async () => ({
          kind: "source-unavailable" as const,
          error: "Original content is unavailable" as const,
        }),
      }),
    );

    expect(html).toContain("Open an email in Inbox");
    expect(html).not.toContain("textarea");
  });

  let windowInstance: Window;
  let root: Root;

  beforeEach(() => {
    windowInstance = new Window({ url: "https://brain.test/cms" });
    const win = windowInstance as unknown as Window & Record<string, unknown>;
    Object.assign(globalThis, {
      window: windowInstance,
      document: windowInstance.document,
      navigator: windowInstance.navigator,
      HTMLElement: win.HTMLElement,
      HTMLTextAreaElement: win.HTMLTextAreaElement,
      Element: win.Element,
      Node: win.Node,
      Event: win.Event,
      InputEvent: win.InputEvent,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    const container = windowInstance.document.createElement("div");
    windowInstance.document.body.append(container);
    root = createRoot(container as unknown as HTMLElement);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    windowInstance.close();
  });

  it("generates, edits, and saves a draft without offering send", async () => {
    const mailItemId = data.mailItemId;
    if (!mailItemId) throw new Error("Missing fixture mail item ID");
    const actions: EmailReplyDraftAction[] = [];
    await act(async () => {
      root.render(
        createElement(EmailReplyDraftWorkspace, {
          data,
          onSource: async () => ({ kind: "source" as const, source }),
          onAction: async (action) => {
            actions.push(action);
            return {
              kind: "draft" as const,
              draft: {
                text:
                  action.type === "generate" ? "Generated reply" : action.text,
                revision: actions.length,
                updatedAt: "2026-08-05T10:00:00.000Z",
              },
            };
          },
        }),
      );
    });

    expect(windowInstance.document.body.textContent).toContain(
      "Could we meet next week? <script>unsafe()</script>",
    );
    expect(windowInstance.document.querySelector("script")).toBeNull();
    expect(windowInstance.document.body.textContent).not.toContain(
      "Send reply",
    );

    const generate = [
      ...windowInstance.document.querySelectorAll("button"),
    ].find((button) => button.textContent === "Generate draft");
    if (!(generate instanceof windowInstance.HTMLButtonElement)) {
      throw new Error("Missing generate button");
    }
    await act(async () => generate.click());
    const textarea = windowInstance.document.querySelector("textarea");
    if (!(textarea instanceof windowInstance.HTMLTextAreaElement)) {
      throw new Error("Missing reply editor");
    }
    expect(textarea.value).toBe("Generated reply");

    await act(async () => {
      textarea.value = "Operator-edited reply";
      textarea.dispatchEvent(
        new windowInstance.InputEvent("input", {
          bubbles: true,
          data: "Operator-edited reply",
          inputType: "insertText",
        }),
      );
    });
    const save = [...windowInstance.document.querySelectorAll("button")].find(
      (button) => button.textContent === "Save draft",
    );
    if (!(save instanceof windowInstance.HTMLButtonElement)) {
      throw new Error("Missing save button");
    }
    await act(async () => save.click());

    expect(actions).toEqual([
      { type: "generate", mailItemId },
      {
        type: "save",
        mailItemId,
        text: "Operator-edited reply",
        baseRevision: 1,
      },
    ]);
  });
});
