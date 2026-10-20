import type { StudioStudyState } from "../fixtures/studio-study-state";
import {
  type VisualCase,
  auditStudioAccessibility,
  recordVisualCapture,
  screenshot,
  settleVisualCapture,
} from "./capture";
import { checkLayout } from "./layout-checks";
import {
  clickSelector,
  clickText,
  evaluatePage,
  fillLabel,
  waitForSelector,
  waitForText,
} from "./page";

/**
 * One study-state case: production workspace providers rendering a
 * disposable source fixture (empty, busy, outage, failure, dense, or
 * restart), verified, laid out, and captured under its own name.
 */
export async function runStudyStateCase(
  visualCase: VisualCase,
  studyState: StudioStudyState,
): Promise<void> {
  const { page, surface, viewport, climate } = visualCase;
  await settleVisualCapture(page);
  await verifyStudyStateSource(page, surface, studyState);
  await checkLayout(page, surface, viewport.width, viewport.height);
  await auditStudioAccessibility(
    page,
    `${surface}-${studyState}-${viewport.width}x${viewport.height}-${climate}`,
  );
  await recordVisualCapture(
    `${surface}-${studyState}-${viewport.width}x${viewport.height}-${climate}.png`,
    await screenshot(page),
  );
  if (studyState === "failure" || studyState === "dense")
    await verifyRetainedDiagnostics(visualCase, studyState);
  if (studyState === "dense") await verifyDenseRecords(visualCase, studyState);
  if (studyState === "busy" && surface === "studio-chat") {
    await clickText(page, "button", "Stop");
    await waitForSelector(page, 'button[aria-label="Send message"]');
    await waitForText(page, "Fixture response remains in progress.");
  }
  console.log(
    `✓ ${surface} ${studyState} ${viewport.width}px ${climate}: source state, layout and protections pass`,
  );
}

const emptyCopy: Record<string, string> = {
  "studio-overview": "Nothing needs your attention.",
  "studio-chat":
    "No messages yet. Your draft stays in the composer until you send it.",
  "studio-inbox": "Nothing needs attention for these filters.",
  "studio-publishing": "Nothing is in flight",
  "studio-site": "Not published yet",
  "studio-content-sync": "No directory sync runs have completed yet.",
  "studio-administration-invitations": "No pending invitations.",
  "studio-administration-audit": "No audit events match these filters.",
  "studio-account": "Managed by the Anchor profile",
};

async function verifyStudyStateSource(
  page: Bun.WebView,
  surface: string,
  studyState: StudioStudyState,
): Promise<void> {
  if (studyState === "empty") {
    const expected = emptyCopy[surface];
    if (!expected) throw Error(`No empty-state assertion for ${surface}`);
    await waitForText(page, expected);
    if (surface === "studio-overview")
      await waitForText(page, "No recent activity is available.");
    if (surface === "studio-inbox")
      await waitForText(
        page,
        "Change Source or Urgency to inspect other incoming work.",
      );
    if (surface === "studio-site")
      await evaluatePage(page, () => {
        if (
          Array.from(document.querySelectorAll("a")).some(
            (a) => a.textContent.trim() === "Open preview",
          )
        )
          throw Error("An absent configured URL must not produce an open link");
      });
    if (surface === "studio-publishing")
      await evaluatePage(page, () => {
        if (document.querySelector('[role="tablist"]'))
          throw Error("Rest state must not retain an empty queue tab");
      });
    if (surface === "studio-account")
      await evaluatePage(page, () => {
        const buttons = Array.from(document.querySelectorAll("button"));
        if (
          buttons.some(
            (b) =>
              b.textContent.trim() === "Save name" ||
              b.textContent.trim() === "Revoke",
          )
        )
          throw Error("Anchor/final-passkey protections lost");
        const endOthers = buttons.find(
          (b) => b.textContent.trim() === "End other sessions",
        );
        if (!endOthers?.disabled)
          throw Error(
            "End other sessions must be disabled with only the current session",
          );
      });
  } else if (studyState === "busy" && surface === "studio-chat") {
    // The composer is labelled for assistive technology, not with visible text.
    await waitForSelector(page, 'textarea[aria-label="Message"]');
    await fillLabel(page, "Message", "Continue the current review");
    await clickSelector(page, 'button[aria-label="Send message"]');
    await waitForText(page, "Fixture response remains in progress.");
    await waitForText(page, "Stop");
  } else if (studyState === "busy") {
    await waitForText(page, "Build preview");
    await waitForText(page, "Published at");
    await evaluatePage(page, () => {
      const build = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === "Build preview",
      );
      if (!build?.disabled)
        throw Error("Active build must disable a duplicate preview request");
    });
  } else if (studyState === "outage")
    await waitForText(page, "Unavailable sources are not an all-clear.");
  else if (studyState === "failure") {
    await waitForText(page, "The latest completed build failed");
    await waitForText(page, "Published at");
    await evaluatePage(page, () => {
      const panel = document.querySelector('[role="tabpanel"]');
      const notice = panel?.querySelector('aside[data-tone="warn"]');
      if (
        !panel ||
        !notice ||
        Math.abs(
          panel.getBoundingClientRect().width -
            notice.getBoundingClientRect().width,
        ) > 2
      )
        throw Error(
          "Build failure must span the environment before its supporting columns",
        );
      const next = notice.closest("section")?.nextElementSibling;
      if (
        !next ||
        next.getBoundingClientRect().top -
          notice.getBoundingClientRect().bottom <
          24
      )
        throw Error("Adjacent tab blocks need shared section spacing");
    });
  } else if (studyState === "restart") {
    await waitForText(page, "Needs you");
    await waitForText(page, "Recent activity");
    await waitForText(page, "No recent autonomous activity.");
  } else await waitForText(page, "unexpected-native-status");
}

/** Expanded diagnostics keep exact references and fit their dialog. */
async function verifyRetainedDiagnostics(
  { page, surface, viewport, climate }: VisualCase,
  studyState: StudioStudyState,
): Promise<void> {
  await clickText(page, "button", "View diagnostics");
  await waitForSelector(page, '[role="dialog"]');
  await waitForText(
    page,
    studyState === "failure"
      ? "Exact diagnostic reference: fixture-preview-failed"
      : "Exact retained diagnostic:",
  );
  await evaluatePage(page, () => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog || dialog.scrollWidth > dialog.clientWidth + 1)
      throw Error("Expanded diagnostics overflow");
    const close = dialog
      .querySelector('[data-slot="dialog-close"]')
      ?.getBoundingClientRect();
    if (innerWidth <= 640 && (!close || close.width < 44 || close.height < 44))
      throw Error("Phone disclosure close target must be at least 44px");
  });
  await recordVisualCapture(
    `${surface}-${studyState}-expanded-${viewport.width}x${viewport.height}-${climate}.png`,
    await screenshot(page),
  );
  if (studyState === "failure") {
    await evaluatePage(page, () => {
      const source = document.querySelector('[role="dialog"] pre');
      if (
        !(source instanceof HTMLElement) ||
        !source.textContent.includes(
          "Retained renderer diagnostic.\n".repeat(180),
        ) ||
        !source.textContent.endsWith(
          "Exact diagnostic reference: fixture-preview-failed",
        )
      )
        throw Error("Build diagnostics were truncated");
      source.scrollTop = source.scrollHeight;
    });
    await recordVisualCapture(
      `${surface}-${studyState}-expanded-end-${viewport.width}x${viewport.height}-${climate}.png`,
      await screenshot(page),
    );
  }
  await clickSelector(page, '[role="dialog"] [aria-label="Close"]');
}

/** Dense repository facts and source records stay whole and in bounds. */
async function verifyDenseRecords(
  { page, surface, viewport, climate }: VisualCase,
  studyState: StudioStudyState,
): Promise<void> {
  await clickText(page, "summary", "Repository details");
  await evaluatePage(page, () => {
    const repository = Array.from(
      document.querySelectorAll("details[open]"),
    ).find((n) =>
      n.querySelector("summary")?.textContent.includes("Repository details"),
    );
    if (
      !repository ||
      !repository.textContent.includes("abcdef123456") ||
      !document.body.textContent.includes(
        `notes/${"nested-directory/".repeat(8)}record-35.md`,
      ) ||
      !document.body.textContent.includes("unexpected-native-status")
    )
      throw Error("Dense repository source records were lost");
    if (repository.scrollWidth > repository.clientWidth + 1)
      throw Error("Dense repository overflows");
    repository.scrollIntoView({ block: "start" });
    window.scrollBy(0, -64);
  });
  await recordVisualCapture(
    `${surface}-${studyState}-repository-${viewport.width}x${viewport.height}-${climate}.png`,
    await screenshot(page),
  );
  await evaluatePage(page, () => {
    const row = Array.from(document.querySelectorAll("main li")).find((n) =>
      n.textContent.includes("unexpected-native-status"),
    );
    if (!row || row.scrollWidth > row.clientWidth + 1)
      throw Error("Dense source record missing or overflowing");
    row.scrollIntoView({ block: "center" });
  });
  await recordVisualCapture(
    `${surface}-${studyState}-records-${viewport.width}x${viewport.height}-${climate}.png`,
    await screenshot(page),
  );
}
