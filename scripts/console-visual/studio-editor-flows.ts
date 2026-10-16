import { isRecord } from "@brains/utils/is-record";
import { systemFixtures } from "../fixtures/studio-system";
import {
  type VisualCase,
  auditStudioAccessibility,
  recordVisualCapture,
  saveArtifactScreenshot,
  screenshot,
  settleVisualCapture,
} from "./capture";
import type { FixtureServerState } from "./fixture-routes";
import {
  activateWorkspaceTab,
  blurLabel,
  clickSelector,
  clickText,
  elementBounds,
  evaluatePage,
  evaluatePageWith,
  fillLabel,
  pointerDownSelector,
  pressKey,
  runPageChecks,
  waitForPage,
  waitForSelector,
  waitForText,
  waitForVisualStability,
} from "./page";
import { entity } from "./studio-fixtures";
import { verifyNativeDateFits } from "./studio-checks";

const studioSaveSelector = ".studio-editor-head-save";

/** Phone System editors switch body modes without hiding Properties. */
export async function exerciseSystemBodyModes(
  page: Bun.WebView,
): Promise<void> {
  for (const label of ["Preview", "Source"]) {
    await evaluatePage(page, () => {
      document
        .querySelector('[aria-label="Editor body view"]')
        ?.scrollIntoView({ block: "center" });
    });
    await activateWorkspaceTab(page, label);
    await waitForPage(`inline ${label} mode`, () =>
      evaluatePageWith(
        page,
        (expected) => {
          const selected = document.querySelector(
            '[aria-label="Editor body view"] [aria-selected="true"]',
          );
          return selected?.textContent.trim() === expected;
        },
        label,
      ),
    );
    if (!(await elementBounds(page, "[data-studio-properties]")))
      throw new Error("Body mode changes must not hide System Properties");
  }
  await evaluatePage(page, () => {
    const content = document.querySelector<HTMLElement>(
      "[data-studio-editor-content]",
    );
    if (content) content.scrollTop = 0;
  });
}

/**
 * Opens the delete confirmation. Phone tucks the control behind the •••
 * disclosure; wider widths show it in the pipeline bar.
 */
export async function exerciseStudioDelete({
  page,
  viewport,
}: VisualCase): Promise<void> {
  if (viewport.width <= 640) {
    await pointerDownSelector(
      page,
      'button[aria-label="More document actions"]',
    );
    await clickSelector(page, '[role="menuitem"]');
  } else {
    await clickSelector(
      page,
      '[data-studio-save-bar] [data-slot="button"][data-variant="danger"]',
    );
  }
  await waitForSelector(page, ".delete-modal");
}

/**
 * The editor's manuscript: highlighted, readable code that copies cleanly,
 * keyboard-scrollable overflow, and sync details on every viewport.
 */
export async function exerciseStudioEditor({
  page,
  viewport,
  climate,
}: VisualCase): Promise<void> {
  if (viewport.width <= 640) {
    await pointerDownSelector(page, ".studio-mobile-tabs button");
    await clickText(page, '[role="menuitem"]', "Preview");
    await waitForSelector(page, '[data-mobile-pane="preview"]');
  }
  await runPageChecks(page, [
    codeTokensHighlighted,
    codeTokensContrast,
    interceptCodeCopies,
  ]);
  await clickSelector(page, '[data-streamdown="code-block-copy-button"]');
  await waitForPage("code copied without line numbers or token markup", () =>
    evaluatePageWith(
      page,
      (expected) => document.documentElement.dataset["copiedCode"] === expected,
      entity.body.split("```ts\n")[1]?.split("\n```")[0] ?? "",
    ),
  );
  await waitForPage("copy action restored", () =>
    evaluatePage(
      page,
      () =>
        document.querySelector('[data-streamdown="code-block-copy-button"]')
          ?.innerHTML === document.documentElement.dataset["copyIcon"],
    ),
  );
  await verifyMarkdownKeyboardScrolling(page);
  await waitForVisualStability(page);
  await evaluatePage(page, () => {
    document
      .querySelectorAll<HTMLElement>(
        '[data-streamdown="code-block-body"], [data-streamdown="table-wrapper"]',
      )
      .forEach((region) => {
        region.scrollLeft = 0;
        region.blur();
      });
    const preview = document.querySelector("[data-studio-preview]");
    if (preview) preview.scrollTop = 0;
  });
  await saveArtifactScreenshot(
    page,
    `studio-markdown-${viewport.width}x${viewport.height}-${climate}.png`,
  );
  if (viewport.width <= 640) {
    await pointerDownSelector(page, ".studio-mobile-tabs button");
    await clickText(page, '[role="menuitem"]', "Properties");
  }
  await clickText(page, "summary", "Sync details");
  await evaluatePage(page, () => {
    const stations = [
      ...document.querySelectorAll<HTMLElement>("[data-studio-station]"),
    ];
    if (
      stations.length === 0 ||
      stations.some((station) => station.getBoundingClientRect().height === 0)
    )
      throw new Error("Sync diagnostics must remain visible on every viewport");
  });
  await clickText(page, "summary", "Sync details");
}

// Page checks: serialized into the page, so each is self-contained.

function codeTokensHighlighted(): void {
  const keyword = document.querySelector<HTMLElement>(
    '[data-code-token="keyword"]',
  );
  const plain = document.querySelector<HTMLElement>(
    '[data-code-token="plain"]',
  );
  if (
    !keyword ||
    !plain ||
    getComputedStyle(keyword).color === getComputedStyle(plain).color
  )
    throw new Error("Code tokens lost theme-aware highlighting");
}

function codeTokensContrast(): void {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!context) throw new Error("Cannot measure syntax contrast");
  const luminance = (pixel: Uint8ClampedArray): number => {
    const linear = (index: number): number => {
      const value = (pixel[index] ?? 0) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linear(0) + 0.7152 * linear(1) + 0.0722 * linear(2);
  };
  for (const token of document.querySelectorAll<HTMLElement>(
    "[data-code-token]",
  )) {
    const ancestors: Element[] = [];
    for (let node: Element | null = token; node; node = node.parentElement)
      ancestors.unshift(node);
    context.clearRect(0, 0, 1, 1);
    context.fillStyle =
      getComputedStyle(token).getPropertyValue("--console-bg");
    context.fillRect(0, 0, 1, 1);
    for (const ancestor of ancestors) {
      context.fillStyle = getComputedStyle(ancestor).backgroundColor;
      context.fillRect(0, 0, 1, 1);
    }
    const background = luminance(context.getImageData(0, 0, 1, 1).data);
    context.fillStyle = getComputedStyle(token).color;
    context.fillRect(0, 0, 1, 1);
    const foreground = luminance(context.getImageData(0, 0, 1, 1).data);
    if (
      (Math.max(background, foreground) + 0.05) /
        (Math.min(background, foreground) + 0.05) <
      4.5
    )
      throw new Error(
        `Insufficient ${token.dataset["codeToken"]} syntax contrast`,
      );
  }
}

/** Records clipboard writes and the copy icon, to verify the copy action. */
function interceptCodeCopies(): void {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text: string): Promise<void> => {
        document.documentElement.dataset["copiedCode"] = text;
      },
    },
  });
  const copy = document.querySelector(
    '[data-streamdown="code-block-copy-button"]',
  );
  if (copy) document.documentElement.dataset["copyIcon"] = copy.innerHTML;
}

async function verifyMarkdownKeyboardScrolling(
  page: Bun.WebView,
): Promise<void> {
  for (const slot of ["code-block-body", "table-wrapper"]) {
    const overflowing = await evaluatePageWith(
      page,
      (name) => {
        const region = document.querySelector<HTMLElement>(
          `[data-streamdown="${name}"]`,
        );
        if (region?.tabIndex !== 0 || !region.getAttribute("aria-label"))
          throw new Error("Markdown overflow is not keyboard accessible");
        region.focus();
        return region.scrollWidth > region.clientWidth;
      },
      slot,
    );
    if (overflowing) {
      await pressKey(page, {
        key: "ArrowRight",
        code: "ArrowRight",
        windowsVirtualKeyCode: 39,
      });
      await waitForPage("markdown keyboard scrolling", () =>
        evaluatePageWith(
          page,
          (name) =>
            (document.querySelector(`[data-streamdown="${name}"]`)
              ?.scrollLeft ?? 0) > 0,
          slot,
        ),
      );
    }
  }
}

/**
 * Saves with an unchanged title: the fixture answers 409, raising the
 * reconcile card above the save bar; comparing must keep the draft.
 */
export async function exerciseStudioConflict(page: Bun.WebView): Promise<void> {
  await clickSelector(page, studioSaveSelector);
  await waitForSelector(page, "[data-studio-conflict]");
  await clickText(page, "button", "Compare changes");
  await waitForSelector(page, '[role="dialog"]');
  await waitForPage("latest conflict version loaded", () =>
    evaluatePage(page, () => {
      const fields = document.querySelectorAll<HTMLTextAreaElement>(
        '[role="dialog"] textarea',
      );
      return (
        fields.length === 2 &&
        fields[1]?.value.includes("Notes from the rhizome") === true
      );
    }),
  );
  await clickText(page, '[role="dialog"] button', "Use latest version");
  await waitForText(page, "Replace your local draft?");
  await clickText(page, "button", "Keep my draft");
  await clickSelector(page, '[role="dialog"] [aria-label="Close"]');
  await waitForPage("comparison closed without replacing draft", () =>
    evaluatePage(
      page,
      () =>
        !document.querySelector('[role="dialog"]') &&
        !!document.querySelector("[data-studio-conflict]"),
    ),
  );
  await evaluatePage(page, () => {
    const active = document.activeElement;
    if (
      !(active instanceof HTMLElement) ||
      active.textContent !== "Compare changes"
    )
      throw new Error("Comparison did not restore trigger focus");
    active.blur();
  });
}

/**
 * Two validation aspects in one frame: a server-rejected save (the fixture
 * 400s on "!!") pins the pipeline error line, then an emptied required title
 * pins the :user-invalid outline.
 */
export async function exerciseStudioInvalid({
  page,
  viewport,
}: VisualCase): Promise<void> {
  await fillLabel(page, "Title", "Notes from the rhizome!!");
  if (viewport.width <= 640) {
    await pointerDownSelector(page, ".studio-mobile-tabs button");
    await clickText(page, '[role="menuitem"]', "Source");
    await waitForSelector(page, '[data-mobile-pane="write"]');
  }
  await clickSelector(page, studioSaveSelector);
  await waitForSelector(page, '[aria-invalid="true"]');
  await evaluatePage(page, () => {
    const input = document.querySelector<HTMLInputElement>(
      '[aria-invalid="true"]',
    );
    if (
      !input ||
      document.activeElement !== input ||
      !input.value.endsWith("!!")
    )
      throw new Error(
        "Server validation must focus the rejected field without changing its draft",
      );
    if (
      !document
        .getElementById(input.getAttribute("aria-describedby") ?? "")
        ?.textContent.includes("Title may not contain")
    )
      throw new Error("Field error has no accessible description");
  });
  await fillLabel(page, "Title", "");
  if (viewport.width <= 640) {
    await pointerDownSelector(page, ".studio-mobile-tabs button");
    await clickText(page, '[role="menuitem"]', "Preview");
    await waitForSelector(page, '[data-mobile-pane="preview"]');
    await clickSelector(page, studioSaveSelector);
    await waitForSelector(page, '[data-mobile-pane="details"]');
    await waitForPage("native validation focuses the revealed property", () =>
      evaluatePage(
        page,
        () =>
          document.activeElement instanceof HTMLInputElement &&
          !document.activeElement.validity.valid,
      ),
    );
  }
  await blurLabel(page, "Title");
  await waitForPage("invalid title field", () =>
    page.evaluate<boolean>(
      'document.querySelector("[data-studio-field] input:user-invalid") !== null',
    ),
  );
}

/** Exercises explicit recovery before leaving a second upload pending. */
export async function exerciseStudioUpload(page: Bun.WebView): Promise<void> {
  for (const name of ["retry-cover.png", "verdigris-board.png"]) {
    const selected = await evaluatePageWith(
      page,
      async ({ selector, url, name, mediaType }) => {
        const input = document.querySelector(selector);
        if (!(input instanceof HTMLInputElement)) return false;
        const response = await fetch(url);
        const file = new File([await response.arrayBuffer()], name, {
          type: mediaType,
        });
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      },
      {
        selector: '[data-studio-field="image"] input[type="file"]',
        url: "/fixture/verdigris.png",
        name,
        mediaType: "image/png",
      },
    );
    if (!selected) throw new Error("Could not select Studio upload input");
    if (name === "retry-cover.png") {
      await waitForText(page, "Fixture upload interrupted");
      await clickText(
        page,
        '[data-studio-field="image"] button',
        "Retry upload",
      );
      await waitForText(page, "Save changes to keep this reference");
      await waitForText(page, "image/recovered-cover");
    } else {
      await waitForText(page, "Uploading verdigris-board.png");
      await evaluatePage(page, () => {
        const status = document.querySelector(
          '[data-studio-field="image"] [role="status"]',
        );
        status?.scrollIntoView({ block: "nearest" });
      });
    }
  }
}

/** The editor's Properties after the main capture: date and upload note. */
export async function captureEditorProperties({
  page,
  viewport,
  climate,
}: VisualCase): Promise<void> {
  if (viewport.width <= 640) {
    await pointerDownSelector(page, 'button[aria-label="Editor view"]');
    await clickText(page, '[role="menuitem"]', "Properties");
  }
  await evaluatePage(page, () => {
    const properties = document.querySelector<HTMLElement>(
      "[data-studio-properties]",
    );
    if (!properties) throw Error("Missing Properties scroller");
    properties.scrollTop = properties.scrollHeight;
    window.scrollTo(0, 0);
  });
  await settleVisualCapture(page);
  await verifyNativeDateFits(page);
  await evaluatePage(page, () => {
    const date = document.querySelector<HTMLInputElement>(
      'input[type="datetime-local"]',
    );
    const note = document.querySelector<HTMLElement>(
      'label:has(input[type="file"]) small',
    );
    if (
      date?.value !== "2026-07-14T09:00" ||
      !note ||
      note.scrollWidth > note.clientWidth + 1
    )
      throw Error(
        "Properties must retain the date value and wrap the full upload guidance",
      );
  });
  const propertiesName = `studio-editor-properties-${viewport.width}x${viewport.height}-${climate}`;
  await auditStudioAccessibility(page, propertiesName);
  await recordVisualCapture(`${propertiesName}.png`, await screenshot(page));
}

/** System documents also capture their body in Source mode. */
export async function captureSystemBody({
  page,
  surface,
  viewport,
  climate,
}: VisualCase): Promise<void> {
  await evaluatePage(page, () =>
    document
      .querySelector("[data-studio-editor-content] > section > header")
      ?.scrollIntoView({ block: "start" }),
  );
  await activateWorkspaceTab(page, "Source");
  await settleVisualCapture(page);
  const bodyName = `${surface}-body-${viewport.width}x${viewport.height}-${climate}`;
  await auditStudioAccessibility(page, bodyName);
  await recordVisualCapture(`${bodyName}.png`, await screenshot(page));
}

/**
 * Nested validation focuses its field, and a save after mode changes sends
 * the edited value beside its siblings with the exact body bytes.
 */
export async function verifySystemSavePayload(
  page: Bun.WebView,
  state: FixtureServerState,
): Promise<void> {
  const original = systemFixtures.get("style-guide")?.entity;
  if (!original || !isRecord(original.frontmatter["voice"]))
    throw Error("Missing real Style guide fixture");
  await fillLabel(page, "Summary", "!!");
  await clickSelector(page, studioSaveSelector);
  await waitForText(page, "Review this summary.");
  if (
    !(await evaluatePage(
      page,
      () => document.activeElement?.getAttribute("aria-invalid") === "true",
    ))
  )
    throw Error("Nested validation must focus its field");
  const summary = "A revised voice, kept only in this fixture.";
  await fillLabel(page, "Summary", summary);
  for (const label of ["Preview", "Source"]) {
    await evaluatePage(page, () =>
      document
        .querySelector('[aria-label="Editor body view"]')
        ?.scrollIntoView({ block: "center" }),
    );
    await activateWorkspaceTab(page, label);
  }
  await clickSelector(page, studioSaveSelector);
  const expected = {
    ...original.frontmatter,
    voice: { ...original.frontmatter["voice"], summary },
  };
  await waitForPage(
    "System save payload",
    async () =>
      JSON.stringify(state.lastSystemSave?.frontmatter) ===
      JSON.stringify(expected),
  );
  if (
    JSON.stringify(state.lastSystemSave?.frontmatter) !==
      JSON.stringify(expected) ||
    state.lastSystemSave?.body !== original.body
  )
    throw Error(
      "Nested edits and mode changes must preserve siblings and exact body bytes",
    );
  console.log(
    "✓ System nested validation, draft handoff and unchanged body payload",
  );
}
