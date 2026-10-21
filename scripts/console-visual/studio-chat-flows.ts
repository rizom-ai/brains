import {
  type VisualCase,
  auditStudioAccessibility,
  recordVisualCapture,
  screenshot,
  settleVisualCapture,
} from "./capture";
import {
  clickSelector,
  clickText,
  ESCAPE_KEY,
  evaluatePage,
  evaluatePageWith,
  fillLabel,
  navigateToNetworkIdle,
  pressKey,
  waitForPage,
  waitForSelector,
  waitForText,
} from "./page";
import { verifyCollectionFiltersFit } from "./studio-checks";

/**
 * Chat before its capture: the conversation renders, then the default
 * surface renames it, browses history, and reads details without losing the
 * draft; the other Chat surfaces open history or context sources.
 */
export async function exerciseStudioChat(
  visualCase: VisualCase,
): Promise<void> {
  const { page, surface } = visualCase;
  await waitForText(page, "And the Studio?");
  await waitForSelector(page, ".studio-chat-upload");
  if (surface === "studio-chat") await renameConversation(page);
  if (surface === "studio-chat") await browseConversationHistory(visualCase);
  if (surface === "studio-chat-sessions") {
    await clickText(
      page,
      ".studio-chat-session-picker-trigger button",
      "History",
    );
  }
  if (surface === "studio-chat") await verifyDetailsKeepDraft(page);
  if (surface === "studio-chat-context") {
    await clickSelector(
      page,
      '[aria-label="Conversation details and options"]',
    );
    await waitForSelector(page, ".studio-chat-details");
    await clickText(
      page,
      ".studio-chat-details summary",
      "Sources and attachments",
    );
  }
}

async function renameConversation(page: Bun.WebView): Promise<void> {
  await clickSelector(page, '[aria-label="Conversation details and options"]');
  await waitForSelector(page, '[role="dialog"]');
  await clickText(page, "button", "Rename");
  await fillLabel(page, "Conversation title", "Reviewed conversation");
  await clickText(page, ".studio-chat-rename button", "Save title");
  await waitForText(page, "Reviewed conversation");
  await clickText(page, "button", "Rename");
  await fillLabel(page, "Conversation title", "Responsive console audit");
  await clickText(page, ".studio-chat-rename button", "Save title");
  await waitForText(page, "Responsive console audit");
  await clickSelector(page, '[role="dialog"] [data-slot="dialog-close"]');
}

/** Searches, filters, and archives history, then reopens the conversation. */
async function browseConversationHistory({
  page,
  viewport,
  climate,
}: VisualCase): Promise<void> {
  await clickSelector(page, ".studio-chat-session-picker-trigger button");
  await waitForSelector(page, '[role="dialog"] .studio-chat-session-picker');
  await fillLabel(page, "Search conversations", "Verdigris");
  await waitForPage("session search filters results", () =>
    evaluatePage(
      page,
      () =>
        document.querySelectorAll('[role="dialog"] .studio-chat-session')
          .length === 1,
    ),
  );
  await fillLabel(page, "Search conversations", "");
  await clickText(page, ".studio-collection-controls summary", "Filter");
  await verifyCollectionFiltersFit(page);
  await waitForPage("unfiltered conversation collection", () =>
    page.evaluate<boolean>(
      'document.querySelector(".studio-chat-session-list")?.textContent?.includes("Responsive console audit") ?? false',
    ),
  );
  await settleVisualCapture(page);
  const filtersName = `studio-chat-filters-${viewport.width}x${viewport.height}-${climate}`;
  await auditStudioAccessibility(page, filtersName);
  await recordVisualCapture(`${filtersName}.png`, await screenshot(page));
  await evaluatePage(page, () => {
    const select = document.querySelector<HTMLSelectElement>(
      '[role="dialog"] select',
    );
    if (!select) throw new Error("Missing archive selector");
    select.value = "archived";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await waitForText(page, "Archived review");
  await evaluatePage(page, () => {
    const select = document.querySelector<HTMLSelectElement>(
      '[role="dialog"] select',
    );
    if (!select) throw new Error("Missing archive selector");
    select.value = "active";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await waitForText(page, "Responsive console audit");
  await clickText(
    page,
    ".studio-chat-session-picker .studio-chat-session",
    "Responsive console audit",
  );
  let restored = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    restored = await evaluatePage(
      page,
      () =>
        !document.querySelector('[role="dialog"]') &&
        document.activeElement?.matches(
          ".studio-chat-session-picker-trigger button",
        ) === true,
    );
    if (restored) break;
    await Bun.sleep(25);
  }
  if (!restored)
    throw new Error(
      "Session selection did not close the dialog and restore focus",
    );
}

async function verifyDetailsKeepDraft(page: Bun.WebView): Promise<void> {
  await fillLabel(page, "Message", "Keep this draft while reading context");
  const height = await evaluatePage(
    page,
    () => document.querySelector(".studio-chat-thread-scroll")?.clientHeight,
  );
  await clickSelector(page, '[aria-label="Conversation details and options"]');
  await waitForSelector(page, ".studio-chat-details");
  await evaluatePageWith(
    page,
    (previousHeight) => {
      if (
        document.querySelector(".studio-chat-thread-scroll")?.clientHeight !==
        previousHeight
      )
        throw new Error("Details squeezed the conversation");
      if (document.querySelectorAll(".studio-chat-context").length !== 1)
        throw new Error("Context duplicated");
    },
    height,
  );
  await clickSelector(page, '[role="dialog"] [data-slot="dialog-close"]');
  await waitForPage("Details focus restoration", () =>
    evaluatePage(
      page,
      () =>
        document.activeElement?.getAttribute("aria-label") ===
        "Conversation details and options",
    ),
  );
  await evaluatePage(page, () => {
    if (
      document.querySelector<HTMLTextAreaElement>(".studio-chat-message")
        ?.value !== "Keep this draft while reading context"
    )
      throw new Error("Details lost draft");
  });
  await fillLabel(page, "Message", "");
}

/**
 * The card-states session after the default capture: the generated image
 * fits its card, and its full preview returns focus on Escape.
 */
export async function verifyChatAttachments({
  page,
  viewport,
  climate,
}: VisualCase): Promise<void> {
  const attachmentUrl = new URL(await page.evaluate<string>("location.href"));
  attachmentUrl.pathname = "/chat";
  attachmentUrl.searchParams.set("session", "cards");
  attachmentUrl.searchParams.set("climate", climate);
  await navigateToNetworkIdle(page, attachmentUrl.href);
  await waitForSelector(page, ".studio-chat-attachment-preview");
  await evaluatePage(page, () =>
    document
      .querySelector(".studio-chat-attachment-preview")
      ?.scrollIntoView({ block: "center" }),
  );
  await waitForPage("generated image to load", () =>
    evaluatePage(page, () => {
      const preview = document.querySelector<HTMLImageElement>(
        ".studio-chat-attachment-preview",
      );
      return Boolean(preview?.complete && preview.naturalWidth > 0);
    }),
  );
  await evaluatePage(page, () => {
    const preview = document.querySelector<HTMLImageElement>(
      ".studio-chat-attachment-preview",
    );
    const card = preview?.closest(".studio-chat-card");
    if (
      !preview ||
      !card ||
      preview.getBoundingClientRect().width > card.clientWidth ||
      document.documentElement.scrollWidth > innerWidth
    )
      throw new Error("Generated image escaped its card or viewport");
  });
  await clickSelector(page, ".studio-chat-image-trigger");
  await waitForPage("full image to load", () =>
    evaluatePage(page, () => {
      const image = document.querySelector<HTMLImageElement>(
        '[role="dialog"] .studio-chat-full-image',
      );
      return Boolean(image?.complete && image.naturalWidth > 0);
    }),
  );
  await auditStudioAccessibility(page, "studio-chat-image-preview");
  await pressKey(page, ESCAPE_KEY);
  await waitForPage("image preview focus restoration", () =>
    evaluatePage(
      page,
      () =>
        !document.querySelector('[role="dialog"]') &&
        document.activeElement?.matches(".studio-chat-image-trigger") === true,
    ),
  );
  const attachmentName = `studio-chat-attachments-${viewport.width}x${viewport.height}-${climate}`;
  await auditStudioAccessibility(page, attachmentName);
  await recordVisualCapture(`${attachmentName}.png`, await screenshot(page));
}
