import { mkdir, writeFile } from "node:fs/promises";
import { isRecord } from "@brains/utils/is-record";
import path from "node:path";
import { systemFixtures } from "./fixtures/studio-system";
import { supportsStudioStudyState } from "./fixtures/studio-study-state";
import {
  auditStudioAccessibility,
  failures,
  openCapturePage,
  recordVisualCapture,
  settleVisualCapture,
} from "./console-visual/capture";
import {
  verifyDashboardChrome,
  verifyDashboardSummary,
  verifyMapMotion,
} from "./console-visual/dashboard-checks";
import { startFixtureServer } from "./console-visual/fixture-server";
import { checkLayout } from "./console-visual/layout-checks";
import {
  ARTIFACT_DIR,
  BASELINE_DIR,
  CLIMATE_FILTER,
  CLIMATES,
  STUDY_STATE,
  SURFACE_FILTER,
  SURFACE_PREFIX,
  UPDATE,
  VIEWPORT_FILTER,
  VIEWPORTS,
} from "./console-visual/options";
import {
  activateWorkspaceTab,
  blurLabel,
  clickSelector,
  clickText,
  elementBounds,
  evaluatePage,
  evaluatePageWith,
  fillLabel,
  navigateToNetworkIdle,
  pointerDownSelector,
  waitForPage,
  waitForSelector,
  waitForText,
  waitForVisualStability,
} from "./console-visual/page";
import {
  verifyAdministrationRecords,
  verifyCollectionFiltersFit,
  verifyDirectStudioNavigation,
  verifyDisabledPrimaries,
  verifyNativeDateFits,
  verifyRecordTypography,
  verifyStudioKeyboardAccess,
  verifyStudioMobileSwitcher,
  verifyStudioProfileNavigation,
} from "./console-visual/studio-checks";
import { entity } from "./console-visual/studio-fixtures";
import { consoleSurfaces, planSurface } from "./console-visual/surfaces";

await mkdir(BASELINE_DIR, { recursive: true });
await mkdir(ARTIFACT_DIR, { recursive: true });
const fixtureServer = await startFixtureServer();

const executablePath = process.env["CONSOLE_CHROMIUM_PATH"];
if (!executablePath) {
  await fixtureServer.stop();
  throw new Error("Set CONSOLE_CHROMIUM_PATH to a Chromium executable.");
}
const browserArgs =
  process.getuid?.() === 0 || process.env["CI"] === "true"
    ? ["--no-sandbox", "--disable-dev-shm-usage"]
    : [];
const browserBackend: Bun.WebView.Backend = {
  type: "chrome",
  url: false,
  path: executablePath,
  ...(browserArgs.length > 0 ? { argv: browserArgs } : {}),
};
try {
  for (const climate of CLIMATES) {
    if (CLIMATE_FILTER && climate !== CLIMATE_FILTER) continue;
    for (const viewport of VIEWPORTS) {
      if (
        VIEWPORT_FILTER &&
        `${viewport.width}x${viewport.height}` !== VIEWPORT_FILTER
      )
        continue;
      for (const surface of consoleSurfaces()) {
        if (SURFACE_FILTER && surface !== SURFACE_FILTER) continue;
        if (SURFACE_PREFIX && !surface.startsWith(SURFACE_PREFIX)) continue;
        if (STUDY_STATE && !supportsStudioStudyState(surface, STUDY_STATE))
          continue;
        const plan = planSurface(surface, STUDY_STATE);
        if (plan.isStudioSecondary && viewport.width === 768) continue;
        console.error(
          `→ ${surface} ${viewport.width}x${viewport.height} ${climate}`,
        );
        fixtureServer.state.reviewingSystem = plan.reviewingSystem;
        const conversationId = "responsive";
        const page = await openCapturePage(
          viewport,
          browserBackend,
          fixtureServer.origin,
          conversationId,
        );
        const studioSaveSelector = ".studio-editor-head-save";
        await navigateToNetworkIdle(
          page,
          `${fixtureServer.origin}${plan.route}?climate=${climate}${plan.workspaceQuery}`,
        );
        const systemFixture = systemFixtures.get(plan.systemType);
        const emptySystemDocument =
          plan.reviewingSystem &&
          !plan.systemCollection &&
          systemFixture?.hasBody &&
          systemFixture.entity.body.trim() === "";
        if (emptySystemDocument)
          await waitForPage(
            "Properties visible when the document has no body",
            () =>
              evaluatePage(
                page,
                () =>
                  document.querySelector<HTMLDetailsElement>(
                    "details[data-studio-properties]",
                  )?.open === true,
              ),
          );
        if (STUDY_STATE) {
          await settleVisualCapture(page);
          const emptyCopy: Record<string, string> = {
            "studio-overview": "Nothing needs your attention.",
            "studio-chat":
              "No messages yet. Your draft stays in the composer until you send it.",
            "studio-inbox": "Nothing needs attention for these filters.",
            "studio-publishing": "Nothing is in flight",
            "studio-site": "Not published yet",
            "studio-content-sync": "No directory sync runs have completed yet.",
            "studio-administration-invitations": "No pending invitations.",
            "studio-administration-audit":
              "No audit events match these filters.",
            "studio-account": "Managed by the Anchor profile",
          };
          if (STUDY_STATE === "empty") {
            const expected = emptyCopy[surface];
            if (!expected)
              throw Error(`No empty-state assertion for ${surface}`);
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
                  throw Error(
                    "An absent configured URL must not produce an open link",
                  );
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
          } else if (STUDY_STATE === "busy" && surface === "studio-chat") {
            await waitForText(page, "Message");
            await fillLabel(page, "Message", "Continue the current review");
            await clickText(page, "button", "Send");
            await waitForText(page, "Fixture response remains in progress.");
            await waitForText(page, "Stop");
          } else if (STUDY_STATE === "busy") {
            await waitForText(page, "Build preview");
            await waitForText(page, "Published generation");
            await evaluatePage(page, () => {
              const build = Array.from(
                document.querySelectorAll("button"),
              ).find((b) => b.textContent.trim() === "Build preview");
              if (!build?.disabled)
                throw Error(
                  "Active build must disable a duplicate preview request",
                );
            });
          } else if (STUDY_STATE === "outage")
            await waitForText(
              page,
              "Unavailable sources are not an all-clear.",
            );
          else if (STUDY_STATE === "failure") {
            await waitForText(page, "The latest completed build failed");
            await waitForText(page, "Published generation");
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
          } else if (STUDY_STATE === "restart") {
            await waitForText(page, "Needs you");
            await waitForText(page, "Recent activity");
            await waitForText(page, "No recent autonomous activity.");
          } else await waitForText(page, "unexpected-native-status");
          await checkLayout(page, surface, viewport.width, viewport.height);
          await auditStudioAccessibility(
            page,
            `${surface}-${STUDY_STATE}-${viewport.width}x${viewport.height}-${climate}`,
          );
          await recordVisualCapture(
            `${surface}-${STUDY_STATE}-${viewport.width}x${viewport.height}-${climate}.png`,
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
          if (STUDY_STATE === "failure" || STUDY_STATE === "dense") {
            await clickText(page, "button", "View diagnostics");
            await waitForSelector(page, '[role="dialog"]');
            await waitForText(
              page,
              STUDY_STATE === "failure"
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
              if (
                innerWidth <= 640 &&
                (!close || close.width < 44 || close.height < 44)
              )
                throw Error(
                  "Phone disclosure close target must be at least 44px",
                );
            });
            await recordVisualCapture(
              `${surface}-${STUDY_STATE}-expanded-${viewport.width}x${viewport.height}-${climate}.png`,
              await page.screenshot({ encoding: "buffer", format: "png" }),
            );
            if (STUDY_STATE === "failure") {
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
                `${surface}-${STUDY_STATE}-expanded-end-${viewport.width}x${viewport.height}-${climate}.png`,
                await page.screenshot({ encoding: "buffer", format: "png" }),
              );
            }
            await clickSelector(page, '[role="dialog"] [aria-label="Close"]');
          }
          if (STUDY_STATE === "dense") {
            await clickText(page, "summary", "Repository details");
            await evaluatePage(page, () => {
              const repository = Array.from(
                document.querySelectorAll("details[open]"),
              ).find((n) =>
                n
                  .querySelector("summary")
                  ?.textContent.includes("Repository details"),
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
              `${surface}-${STUDY_STATE}-repository-${viewport.width}x${viewport.height}-${climate}.png`,
              await page.screenshot({ encoding: "buffer", format: "png" }),
            );
            await evaluatePage(page, () => {
              const row = Array.from(document.querySelectorAll("main li")).find(
                (n) => n.textContent.includes("unexpected-native-status"),
              );
              if (!row || row.scrollWidth > row.clientWidth + 1)
                throw Error("Dense source record missing or overflowing");
              row.scrollIntoView({ block: "center" });
            });
            await recordVisualCapture(
              `${surface}-${STUDY_STATE}-records-${viewport.width}x${viewport.height}-${climate}.png`,
              await page.screenshot({ encoding: "buffer", format: "png" }),
            );
          }
          if (STUDY_STATE === "busy" && surface === "studio-chat") {
            await clickText(page, "button", "Stop");
            await waitForText(page, "Send");
            await waitForText(page, "Fixture response remains in progress.");
          }
          console.log(
            `✓ ${surface} ${STUDY_STATE} ${viewport.width}px ${climate}: source state, layout and protections pass`,
          );
          page.close();
          continue;
        }
        if (
          surface === "studio-system" &&
          viewport.width <= 640 &&
          climate === "instrument"
        ) {
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
              throw new Error(
                "Body mode changes must not hide System Properties",
              );
          }
          await evaluatePage(page, () => {
            const content = document.querySelector<HTMLElement>(
              "[data-studio-editor-content]",
            );
            if (content) content.scrollTop = 0;
          });
        }
        if (surface.startsWith("studio-navigation")) {
          if (viewport.width > 900) {
            await clickSelector(page, ".studio-navigation-collapse");
            await waitForPage("collapsed shell width", () =>
              page.evaluate<boolean>(
                'Math.round(document.querySelector(".rail").getBoundingClientRect().width) === 68 && getComputedStyle(document.querySelector(".studio-leaf-rail")).display === "none"',
              ),
            );
            const currentPath =
              await page.evaluate<string>("location.pathname");
            await clickText(page, ".studio-area-link", "Work");
            if (
              (await page.evaluate<string>("location.pathname")) !== currentPath
            ) {
              throw new Error(
                "Browsing Work navigated away from the current document",
              );
            }
            await waitForSelector(
              page,
              '.studio-leaf-rail[aria-label="Work destinations"]',
            );
            await waitForPage("area click expands shell", () =>
              page.evaluate<boolean>(
                'Math.round(document.querySelector(".rail").getBoundingClientRect().width) === 344',
              ),
            );
            if (surface.endsWith("-collapsed"))
              await clickSelector(page, ".studio-navigation-collapse");
          } else {
            await clickSelector(page, ".studio-mobile-switcher");
            await waitForSelector(page, ".studio-mobile-navigation-sheet");
            if (surface.endsWith("-collapsed"))
              await clickText(
                page,
                ".studio-mobile-navigation-group summary",
                "Library",
              );
          }
        }
        if (
          surface === "studio-overview" &&
          viewport.width <= 640 &&
          climate === "instrument"
        ) {
          await verifyStudioMobileSwitcher(page);
        }
        if (surface.startsWith("studio-chat")) {
          await waitForText(page, "And the Studio?");
          await waitForSelector(page, ".studio-chat-upload");
          if (surface === "studio-chat") {
            await clickSelector(
              page,
              '[aria-label="Conversation details and options"]',
            );
            await waitForSelector(page, '[role="dialog"]');
            await clickText(page, "button", "Rename");
            await fillLabel(
              page,
              "Conversation title",
              "Reviewed conversation",
            );
            await clickText(page, ".studio-chat-rename button", "Save title");
            await waitForText(page, "Reviewed conversation");
            await clickText(page, "button", "Rename");
            await fillLabel(
              page,
              "Conversation title",
              "Responsive console audit",
            );
            await clickText(page, ".studio-chat-rename button", "Save title");
            await waitForText(page, "Responsive console audit");
            await clickSelector(
              page,
              '[role="dialog"] [data-slot="dialog-close"]',
            );
          }
          if (surface === "studio-chat") {
            await clickSelector(
              page,
              ".studio-chat-session-picker-trigger button",
            );
            await waitForSelector(
              page,
              '[role="dialog"] .studio-chat-session-picker',
            );
            await fillLabel(page, "Search conversations", "Verdigris");
            await waitForPage("session search filters results", () =>
              evaluatePage(
                page,
                () =>
                  document.querySelectorAll(
                    '[role="dialog"] .studio-chat-session',
                  ).length === 1,
              ),
            );
            await fillLabel(page, "Search conversations", "");
            await clickText(
              page,
              ".studio-collection-controls summary",
              "Filter",
            );
            await verifyCollectionFiltersFit(page);
            await waitForPage("unfiltered conversation collection", () =>
              page.evaluate<boolean>(
                'document.querySelector(".studio-chat-session-list")?.textContent?.includes("Responsive console audit") ?? false',
              ),
            );
            await settleVisualCapture(page);
            const filtersName = `studio-chat-filters-${viewport.width}x${viewport.height}-${climate}`;
            await auditStudioAccessibility(page, filtersName);
            await recordVisualCapture(
              `${filtersName}.png`,
              await page.screenshot({ encoding: "buffer", format: "png" }),
            );
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
          if (surface === "studio-chat-sessions") {
            await clickText(
              page,
              ".studio-chat-session-picker-trigger button",
              "History",
            );
          }
          if (surface === "studio-chat") {
            await fillLabel(
              page,
              "Message",
              "Keep this draft while reading context",
            );
            const height = await evaluatePage(
              page,
              () =>
                document.querySelector(".studio-chat-thread-scroll")
                  ?.clientHeight,
            );
            await clickSelector(
              page,
              '[aria-label="Conversation details and options"]',
            );
            await waitForSelector(page, ".studio-chat-details");
            await evaluatePageWith(
              page,
              (previousHeight) => {
                if (
                  document.querySelector(".studio-chat-thread-scroll")
                    ?.clientHeight !== previousHeight
                )
                  throw new Error("Details squeezed the conversation");
                if (
                  document.querySelectorAll(".studio-chat-context").length !== 1
                )
                  throw new Error("Context duplicated");
              },
              height,
            );
            await clickSelector(
              page,
              '[role="dialog"] [data-slot="dialog-close"]',
            );
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
                document.querySelector<HTMLTextAreaElement>(
                  ".studio-chat-message",
                )?.value !== "Keep this draft while reading context"
              )
                throw new Error("Details lost draft");
            });
            await fillLabel(page, "Message", "");
          }
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

        if (plan.isDashboard) {
          await verifyDashboardChrome(page);
          await verifyDashboardSummary(page);
          if (surface === "dashboard") {
            const previousHash = await evaluatePage(
              page,
              () => window.location.hash,
            );
            await clickSelector(page, '[data-dashboard-tab-link="system"]');
            await evaluatePage(page, async () => {
              await document.fonts.ready;
              window.scrollTo(0, 0);
            });
            await writeFile(
              path.join(
                ARTIFACT_DIR,
                `dashboard-system-${viewport.width}x${viewport.height}-${climate}.png`,
              ),
              await page.screenshot({ encoding: "buffer", format: "png" }),
            );
            if (viewport.width <= 700) {
              await evaluatePage(page, () =>
                document
                  .querySelector(".system-checks-card")
                  ?.scrollIntoView({ block: "start" }),
              );
              await writeFile(
                path.join(
                  ARTIFACT_DIR,
                  `dashboard-system-checks-${viewport.width}x${viewport.height}-${climate}.png`,
                ),
                await page.screenshot({ encoding: "buffer", format: "png" }),
              );
            }
            if (viewport.width <= 960) {
              await evaluatePage(page, () =>
                document
                  .querySelector(".system-runtime-card")
                  ?.scrollIntoView({ block: "start" }),
              );
              await writeFile(
                path.join(
                  ARTIFACT_DIR,
                  `dashboard-system-reference-${viewport.width}x${viewport.height}-${climate}.png`,
                ),
                await page.screenshot({ encoding: "buffer", format: "png" }),
              );
            }
            await clickSelector(page, '[data-dashboard-tab-link="overview"]');
            await evaluatePageWith(
              page,
              (hash) => {
                window.history.replaceState(
                  null,
                  "",
                  window.location.pathname + window.location.search + hash,
                );
                window.scrollTo(0, 0);
              },
              previousHash,
            );
          }
        }
        if (
          surface === "dashboard-knowledge" ||
          surface === "dashboard-network"
        ) {
          const tab =
            surface === "dashboard-knowledge" ? "knowledge" : "network";
          await clickSelector(page, `[data-dashboard-tab-link="${tab}"]`);
          await evaluatePage(page, () => window.scrollTo(0, 0));
        }
        if (surface === "studio-library") {
          await waitForText(page, "1–25 of 54");
          await clickText(page, ".listing-pagination button", "Next");
          await waitForText(page, "26–50 of 54");
          await waitForText(page, "Archive note 22");
          await clickText(page, ".listing-pagination button", "Previous");
          await waitForText(page, "A console that travels well");
          await waitForText(page, "1–25 of 54");
          await clickText(page, ".listing-pagination button", "Next");
          await fillLabel(page, "Search title or content", "Archive note 22");
          await waitForText(page, "1–1 of 1");
          await evaluatePage(page, () => {
            if (new URLSearchParams(location.search).has("offset"))
              throw new Error("Searching must reset collection offset");
          });
          await clickText(
            page,
            ".studio-collection-controls summary",
            "Filter and sort",
          );
          await verifyCollectionFiltersFit(page);
          await settleVisualCapture(page);
          const filtersName = `studio-library-filters-${viewport.width}x${viewport.height}-${climate}`;
          await auditStudioAccessibility(page, filtersName);
          await recordVisualCapture(
            `${filtersName}.png`,
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
          await evaluatePage(page, () => {
            const select = document.querySelector<HTMLSelectElement>(
              ".studio-collection-controls select",
            );
            if (!select) throw new Error("Visibility filter missing");
            select.value = "restricted";
            select.dispatchEvent(new Event("change", { bubbles: true }));
          });
          await waitForText(page, "No entries match these filters");
          await clickText(page, ".studio-collection-controls button", "Clear");
          await waitForText(page, "1–25 of 54");
          await evaluatePage(page, () => history.back());
          await waitForText(page, "No entries match these filters");
          await evaluatePage(page, () => history.forward());
          await waitForText(page, "1–25 of 54");
          await evaluatePage(page, () => {
            const details = document.querySelector<HTMLDetailsElement>(
              ".studio-collection-controls details",
            );
            if (details) details.open = false;
          });
        }
        if (surface === "studio-overview") {
          await waitForText(page, "Recent activity");
        }
        if (surface === "studio-content-sync") {
          await waitForText(page, "Recent runs");
          await waitForText(page, "Connection");
          await waitForText(page, "Repository sync needs attention");
          await clickText(page, "button", "View diagnostics");
          await waitForSelector(page, '[role="dialog"]');
          await evaluatePage(page, () => {
            const dialog = document.querySelector('[role="dialog"]');
            for (const record of [
              "git push origin main exited with 1",
              "git pull origin main exited with 1",
              "Occurred: 2026-07-11T09:15:00.000Z",
              "Occurred: 2026-07-11T09:14:30.000Z",
            ]) {
              if (!dialog?.textContent.includes(record))
                throw new Error(
                  "Sync diagnostics lost a recorded operation or timestamp",
                );
            }
          });
          await clickSelector(page, '[role="dialog"] [aria-label="Close"]');
          await waitForPage("sync diagnostics closed", () =>
            evaluatePage(
              page,
              () => !document.querySelector('[role="dialog"]'),
            ),
          );
          await clickText(page, "summary", "Repository details");
          await evaluatePage(page, () => {
            const repository = [
              ...document.querySelectorAll("details[open]"),
            ].find((node) =>
              node
                .querySelector("summary")
                ?.textContent.includes("Repository details"),
            );
            if (!repository)
              throw new Error("Missing expanded repository facts");
            const labels = [...repository.querySelectorAll("dt")].map(
              (node) => node.textContent,
            );
            for (const label of [
              "Content files",
              "Issues",
              "Commits ahead",
              "Commits behind",
              "Commit debounce",
            ])
              if (labels.filter((value) => value === label).length !== 1)
                throw new Error(
                  `Repository fact missing or repeated: ${label}`,
                );
            if (!repository.textContent.includes("abcdef123456"))
              throw new Error(
                "Repository details lost the exact commit identifier",
              );
            repository.scrollIntoView({ block: "start" });
            window.scrollBy(0, -64);
          });
          await evaluatePage(page, async () => {
            await document.fonts.ready;
          });
          await writeFile(
            path.join(
              ARTIFACT_DIR,
              `studio-content-sync-repository-${viewport.width}x${viewport.height}-${climate}.png`,
            ),
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
          await clickText(page, "summary", "Repository details");
          await evaluatePage(page, () => {
            let node: HTMLElement | null =
              [...document.querySelectorAll<HTMLElement>("summary")].find(
                (item) => item.textContent.includes("Repository details"),
              ) ?? null;
            while (node) {
              node.scrollTop = 0;
              node = node.parentElement;
            }
          });
        }
        if (surface === "studio-site") {
          await waitForText(page, "Build preview");
          await evaluatePage(page, () => {
            const controls = document.querySelector("[data-card-controls]");
            const link = controls?.querySelector("a");
            if (link?.getAttribute("href") !== "https://preview.example.com")
              throw new Error("Published state lost its preview link");
            if (
              window.innerWidth <= 640 &&
              link.getBoundingClientRect().height < 44
            )
              throw new Error("Preview link lost its phone touch target");
            for (const details of document.querySelectorAll(
              ".declarative-card:is(details)",
            ))
              if (details.hasAttribute("open"))
                throw new Error("Supporting Site details should start folded");
          });
          await clickText(page, "summary", "Render details");
          await waitForPage("retained render details", () =>
            evaluatePage(page, () =>
              [...document.querySelectorAll("details[open]")].some(
                (node) =>
                  node.textContent.includes("Last successful render") &&
                  node.textContent.includes("build-20260711163352-preview"),
              ),
            ),
          );
          await clickText(page, "summary", "Render details");
          await clickText(page, "summary", "Configured routes");
          await evaluatePage(page, () => {
            const routes = [...document.querySelectorAll("details[open]")].find(
              (node) => node.textContent.includes("Configured routes"),
            );
            if (
              routes?.querySelectorAll("tbody tr").length !== 8 ||
              !routes.textContent.includes("23 further routes")
            )
              throw new Error(
                "Configured routes lost their bounded preview or remainder",
              );
          });
          await clickText(page, "summary", "Configured routes");
          await activateWorkspaceTab(page, "Production");
          await waitForText(page, "Build production");
          await clickText(page, "button", "Build production");
          await waitForText(page, "Build and publish the production site now?");
          await clickText(
            page,
            '[role="dialog"] button, [role="alertdialog"] button',
            "Cancel",
          );
          await waitForText(page, "Published generation");
          await activateWorkspaceTab(page, "Preview");
          await waitForText(page, "Build preview");
        }
        if (surface === "studio-publishing") {
          await waitForText(page, "Notes from the rhizome");
          await evaluatePage(page, () => {
            if (
              !document
                .querySelector("[data-studio-page-head]")
                ?.textContent.includes("14 published") ||
              document.querySelector('[data-block-id="publishing-summary"]')
            )
              throw Error(
                "Published totals belong in the page head, not a separate body panel",
              );
          });
          await evaluatePage(page, () => {
            const attention = document.querySelector(
              'section[data-tone="warn"]',
            );
            if (
              !attention ||
              document.querySelector('[role="dialog"]') ||
              !attention
                .querySelector("header")
                ?.textContent.includes("Retries: 1") ||
              !attention
                .querySelector("h2")
                ?.textContent.includes("One delivery needs attention")
            )
              throw new Error(
                "Publishing attention is missing or exposes its controls at rest",
              );
          });
          await clickText(page, "button", "Review failure");
          await waitForSelector(page, '[role="dialog"]');
          await evaluatePage(page, () => {
            const attention = document.querySelector('[role="dialog"]');
            const retry = [
              ...(attention?.querySelectorAll("button") ?? []),
            ].find((button) =>
              button.textContent.includes("Retry publication"),
            );
            if (
              !attention?.textContent.includes(
                "Provider rejected the last delivery attempt.",
              ) ||
              !retry ||
              retry.disabled
            )
              throw new Error(
                "Publication review lost diagnostics or its retry action",
              );
          });
          await clickSelector(page, '[role="dialog"] [aria-label="Close"]');
          await waitForPage("failure review closed", () =>
            evaluatePage(
              page,
              () => !document.querySelector('[role="dialog"]'),
            ),
          );
          await clickText(page, "button", "Queue options");
          await waitForSelector(page, '[role="dialog"]');
          await evaluatePage(page, () => {
            const buttons = [
              ...document.querySelectorAll<HTMLButtonElement>(
                '[role="dialog"] button',
              ),
            ];
            for (const label of ["Move up", "Move down"]) {
              const button = buttons.find((node) =>
                node.textContent.includes(label),
              );
              if (!button?.disabled)
                throw new Error(
                  "Single-item destination must retain disabled reorder boundaries",
                );
            }
            if (
              !buttons.some(
                (button) =>
                  button.textContent.includes("Remove from queue") &&
                  !button.disabled,
              )
            )
              throw new Error("Queue options lost removal");
          });
          await clickSelector(page, '[role="dialog"] [aria-label="Close"]');
          await waitForPage("queue options closed", () =>
            evaluatePage(
              page,
              () => !document.querySelector('[role="dialog"]'),
            ),
          );
          await activateWorkspaceTab(page, "Generating (1)");
          await waitForText(page, "og-image");
          await activateWorkspaceTab(page, "Queued (3)");
          await waitForText(page, "Quiet infrastructure");
        }
        if (
          surface === "studio-content-sync" ||
          surface === "studio-inbox" ||
          surface === "studio-overview"
        )
          await verifyRecordTypography(page);
        if (surface === "studio-account") {
          // Exercise the real account tabs, including native hidden-panel layout.
          for (const index of [1, 2, 3, 0]) {
            await evaluatePageWith(
              page,
              (tabIndex) => {
                const tab = document.querySelectorAll<HTMLElement>(
                  '.account-details [role="tab"]',
                )[tabIndex];
                if (!tab) throw new Error("Account section missing");
                tab.focus();
                tab.dispatchEvent(
                  new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
                );
              },
              index,
            );
            await waitForSelector(
              page,
              `.account-details [role="tab"]:nth-child(${index + 1})[aria-selected="true"]`,
            );
            await evaluatePage(page, () => {
              const panels = [
                ...document.querySelectorAll<HTMLElement>(
                  '.account-details [role="tabpanel"]',
                ),
              ];
              if (
                panels.filter(
                  (panel) => getComputedStyle(panel).display !== "none",
                ).length !== 1
              )
                throw new Error("Inactive account sections must stay hidden");
              const selected = document.querySelector<HTMLElement>(
                '.account-details [role="tab"][aria-selected="true"]',
              );
              const list = selected
                ?.closest('[role="tablist"]')
                ?.getBoundingClientRect();
              const rect = selected?.getBoundingClientRect();
              if (
                !list ||
                !rect ||
                rect.left < list.left - 1 ||
                rect.right > list.right + 1
              )
                throw new Error(
                  "Selected account tab must remain fully visible",
                );
            });
            if (index === 3) {
              await clickSelector(
                page,
                '.account-details [role="tabpanel"]:not([hidden]) summary',
              );
            }
            if (index !== 0) {
              await settleVisualCapture(page);
              await recordVisualCapture(
                `studio-account-${index === 1 ? "security" : index === 2 ? "identities" : "settings"}-${viewport.width}x${viewport.height}-${climate}.png`,
                Buffer.from(
                  await page.screenshot({ encoding: "buffer", format: "png" }),
                ),
              );
            }
          }
        }
        if (surface === "studio-administration-invitations-form") {
          await clickSelector(page, ".declarative-action-disclosure");
        }
        if (surface === "studio-delete") {
          // Open the delete confirmation. Phone tucks the control behind
          // the ••• disclosure; wider widths show it in the pipeline bar.
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
        if (surface === "studio-editor") {
          if (viewport.width <= 640) {
            await pointerDownSelector(page, ".studio-mobile-tabs button");
            await clickText(page, '[role="menuitem"]', "Preview");
            await waitForSelector(page, '[data-mobile-pane="preview"]');
          }
          await evaluatePage(page, () => {
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
              return (
                0.2126 * linear(0) + 0.7152 * linear(1) + 0.0722 * linear(2)
              );
            };
            for (const token of document.querySelectorAll<HTMLElement>(
              "[data-code-token]",
            )) {
              const ancestors: Element[] = [];
              for (
                let node: Element | null = token;
                node;
                node = node.parentElement
              )
                ancestors.unshift(node);
              context.clearRect(0, 0, 1, 1);
              context.fillStyle =
                getComputedStyle(token).getPropertyValue("--console-bg");
              context.fillRect(0, 0, 1, 1);
              for (const ancestor of ancestors) {
                context.fillStyle = getComputedStyle(ancestor).backgroundColor;
                context.fillRect(0, 0, 1, 1);
              }
              const background = luminance(
                context.getImageData(0, 0, 1, 1).data,
              );
              context.fillStyle = getComputedStyle(token).color;
              context.fillRect(0, 0, 1, 1);
              const foreground = luminance(
                context.getImageData(0, 0, 1, 1).data,
              );
              if (
                (Math.max(background, foreground) + 0.05) /
                  (Math.min(background, foreground) + 0.05) <
                4.5
              )
                throw new Error(
                  `Insufficient ${token.dataset["codeToken"]} syntax contrast`,
                );
            }
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
            if (copy)
              document.documentElement.dataset["copyIcon"] = copy.innerHTML;
          });
          await clickSelector(
            page,
            '[data-streamdown="code-block-copy-button"]',
          );
          await waitForPage(
            "code copied without line numbers or token markup",
            () =>
              evaluatePageWith(
                page,
                (expected) =>
                  document.documentElement.dataset["copiedCode"] === expected,
                entity.body.split("```ts\n")[1]?.split("\n```")[0] ?? "",
              ),
          );
          await waitForPage("copy action restored", () =>
            evaluatePage(
              page,
              () =>
                document.querySelector(
                  '[data-streamdown="code-block-copy-button"]',
                )?.innerHTML === document.documentElement.dataset["copyIcon"],
            ),
          );
          for (const slot of ["code-block-body", "table-wrapper"]) {
            const overflowing = await evaluatePageWith(
              page,
              (name) => {
                const region = document.querySelector<HTMLElement>(
                  `[data-streamdown="${name}"]`,
                );
                if (
                  region?.tabIndex !== 0 ||
                  !region.getAttribute("aria-label")
                )
                  throw new Error(
                    "Markdown overflow is not keyboard accessible",
                  );
                region.focus();
                return region.scrollWidth > region.clientWidth;
              },
              slot,
            );
            if (overflowing) {
              await page.cdp("Input.dispatchKeyEvent", {
                type: "keyDown",
                key: "ArrowRight",
                code: "ArrowRight",
                windowsVirtualKeyCode: 39,
              });
              await page.cdp("Input.dispatchKeyEvent", {
                type: "keyUp",
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
          await writeFile(
            path.join(
              ARTIFACT_DIR,
              `studio-markdown-${viewport.width}x${viewport.height}-${climate}.png`,
            ),
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
          if (viewport.width <= 640) {
            await pointerDownSelector(page, ".studio-mobile-tabs button");
            await clickText(page, '[role="menuitem"]', "Properties");
          }
          await clickText(page, "summary", "Sync details");
          await evaluatePage(page, () => {
            const stations = [
              ...document.querySelectorAll<HTMLElement>(
                "[data-studio-station]",
              ),
            ];
            if (
              stations.length === 0 ||
              stations.some(
                (station) => station.getBoundingClientRect().height === 0,
              )
            )
              throw new Error(
                "Sync diagnostics must remain visible on every viewport",
              );
          });
          await clickText(page, "summary", "Sync details");
        }
        if (surface === "studio-conflict") {
          // Save with an unchanged title: the fixture answers 409, raising
          // the reconcile card above the save bar.
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
        if (surface === "studio-invalid") {
          // Two validation aspects in one frame: a server-rejected save
          // (the fixture 400s on "!!") pins the pipeline error line, then
          // an emptied required title pins the :user-invalid outline.
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
            await waitForPage(
              "native validation focuses the revealed property",
              () =>
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
        if (surface === "studio-upload") {
          // Exercise explicit recovery before leaving a second upload pending.
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
            if (!selected)
              throw new Error("Could not select Studio upload input");
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
        if (
          ["studio-chat", "studio-administration", "studio-account"].includes(
            surface,
          )
        )
          await verifyDirectStudioNavigation(page, surface, viewport.width);
        if (
          [
            "studio-administration",
            "studio-administration-invitations",
            "studio-administration-audit",
          ].includes(surface)
        )
          await verifyAdministrationRecords(page, surface);
        await evaluatePage(page, () => document.fonts.ready);
        await waitForVisualStability(page);
        await checkLayout(page, surface, viewport.width, viewport.height);
        if (surface.startsWith("studio-"))
          await verifyStudioKeyboardAccess(page);
        if (surface.startsWith("studio-"))
          await auditStudioAccessibility(
            page,
            `${surface}-${viewport.width}x${viewport.height}-${climate}`,
          );
        await settleVisualCapture(page);
        await verifyDisabledPrimaries(page);
        const image = await page.screenshot({
          encoding: "buffer",
          format: "png",
        });
        if (surface === "studio-editor") {
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
          await recordVisualCapture(
            `${propertiesName}.png`,
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
        }
        if (
          surface === "studio-system" ||
          surface === "studio-system-anchor-profile"
        ) {
          await evaluatePage(page, () =>
            document
              .querySelector("[data-studio-editor-content] > section > header")
              ?.scrollIntoView({ block: "start" }),
          );
          await activateWorkspaceTab(page, "Source");
          await settleVisualCapture(page);
          const bodyName = `${surface}-body-${viewport.width}x${viewport.height}-${climate}`;
          await auditStudioAccessibility(page, bodyName);
          await recordVisualCapture(
            `${bodyName}.png`,
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
        }
        if (
          surface === "studio-system" &&
          viewport.width === 1440 &&
          climate === "instrument"
        ) {
          const original = systemFixtures.get("style-guide")?.entity;
          if (!original || !isRecord(original.frontmatter["voice"]))
            throw Error("Missing real Style guide fixture");
          await fillLabel(page, "Summary", "!!");
          await clickSelector(page, studioSaveSelector);
          await waitForText(page, "Review this summary.");
          if (
            !(await evaluatePage(
              page,
              () =>
                document.activeElement?.getAttribute("aria-invalid") === "true",
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
              JSON.stringify(
                fixtureServer.state.lastSystemSave?.frontmatter,
              ) === JSON.stringify(expected),
          );
          if (
            JSON.stringify(fixtureServer.state.lastSystemSave?.frontmatter) !==
              JSON.stringify(expected) ||
            fixtureServer.state.lastSystemSave?.body !== original.body
          )
            throw Error(
              "Nested edits and mode changes must preserve siblings and exact body bytes",
            );
          console.log(
            "✓ System nested validation, draft handoff and unchanged body payload",
          );
        }
        if (surface === "dashboard") {
          await navigateToNetworkIdle(
            page,
            `${fixtureServer.origin}/dashboard?climate=${climate}&fixture-state=waiting#system`,
          );
          await evaluatePage(page, async () => {
            await document.fonts.ready;
            const panel = document.getElementById("system");
            if (
              !panel ||
              panel.hidden ||
              !panel.querySelector('[data-status-summary="warn"]') ||
              !panel.querySelector('[data-readiness-tone="neutral"]') ||
              panel.querySelectorAll('tbody tr[data-tone="warn"]').length !== 2
            )
              throw new Error(
                "Production System rendering lost degraded/waiting states",
              );
            if (
              !panel.textContent.includes(
                "One or more advertised public surfaces are unavailable.",
              )
            )
              throw new Error("Missing public outage diagnostic");
            window.scrollTo(0, 0);
          });
          await writeFile(
            path.join(
              ARTIFACT_DIR,
              `dashboard-system-waiting-${viewport.width}x${viewport.height}-${climate}.png`,
            ),
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
        }
        if (surface === "dashboard") {
          for (const tab of ["knowledge", "network"] as const) {
            await clickSelector(page, `[data-dashboard-tab-link="${tab}"]`);
            await evaluatePageWith(
              page,
              (section) => {
                const panel = document.getElementById(section);
                const frame = panel?.querySelector<HTMLElement>(".map-field");
                const empty = frame?.querySelector(".map-empty");
                if (
                  !panel ||
                  panel.hidden ||
                  !frame ||
                  !empty ||
                  panel.querySelector("svg") ||
                  Math.abs(
                    empty.getBoundingClientRect().width - frame.clientWidth,
                  ) > 1 ||
                  getComputedStyle(empty).minHeight !==
                    (window.innerWidth <= 700 ? "260px" : "360px")
                )
                  throw new Error(
                    "Empty map lost its full-width reading state",
                  );
                window.scrollTo(0, 0);
              },
              tab,
            );
            await writeFile(
              path.join(
                ARTIFACT_DIR,
                `dashboard-${tab}-empty-${viewport.width}x${viewport.height}-${climate}.png`,
              ),
              await page.screenshot({ encoding: "buffer", format: "png" }),
            );
          }
          await navigateToNetworkIdle(
            page,
            `${fixtureServer.origin}/dashboard?climate=${climate}&fixture-state=declarative-network#network`,
          );
          await evaluatePage(page, async () => {
            await document.fonts.ready;
            const frame = document.querySelector<HTMLElement>(
              ".proximity-map-field",
            );
            const graphic = frame?.querySelector("svg");
            if (!frame || !graphic)
              throw new Error("Missing declarative network frame");
            if (
              graphic.getAttribute("viewBox") !== "0 0 980 560" ||
              Math.abs(
                graphic.getBoundingClientRect().width / frame.clientWidth -
                  (window.innerWidth <= 700 ? 1.55 : 1),
              ) > 0.01 ||
              getComputedStyle(graphic).minHeight !==
                (window.innerWidth <= 700 ? "260px" : "360px") ||
              !getComputedStyle(frame).backgroundImage.includes(
                "radial-gradient",
              )
            )
              throw new Error(
                "Declarative network lost its compiled projection frame",
              );
            window.scrollTo(0, 0);
          });
          await verifyMapMotion(page);
          await writeFile(
            path.join(
              ARTIFACT_DIR,
              `dashboard-network-declarative-${viewport.width}x${viewport.height}-${climate}.png`,
            ),
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
        }
        if (surface === "dashboard") {
          await navigateToNetworkIdle(
            page,
            `${fixtureServer.origin}/dashboard?climate=${climate}&fixture-state=dense-map#knowledge`,
          );
          await evaluatePage(page, async () => {
            await document.fonts.ready;
            const index =
              document.querySelector<HTMLElement>("[data-map-index]");
            const remainder = index?.querySelector(
              "[data-map-index-remainder]",
            );
            const note = index?.querySelector("[data-map-index-note]");
            const controls = index?.querySelectorAll("button");
            if (!index || !remainder || !note || controls?.length !== 8)
              throw new Error(
                "Dense atlas lost its bounded index and remainder",
              );
            if (
              !remainder.textContent.includes("12 smaller territories") ||
              index.scrollWidth > index.clientWidth + 1
            )
              throw new Error("Dense atlas lost source detail or bounds");
            if (
              window.innerWidth > 700 &&
              note.getBoundingClientRect().top <
                remainder.getBoundingClientRect().bottom - 1
            )
              throw new Error("Dense atlas guidance overlaps its remainder");
            if (
              remainder.getBoundingClientRect().top <
                Math.max(
                  ...Array.from(
                    controls,
                    (control) => control.getBoundingClientRect().bottom,
                  ),
                ) -
                  1 ||
              (window.innerWidth > 700 &&
                note.getBoundingClientRect().bottom >
                  index.getBoundingClientRect().bottom + 1)
            )
              throw new Error(
                "Dense atlas clips or overlaps its full record list",
              );
            for (const control of controls) {
              if (
                control.title !==
                  control.querySelector("strong")?.textContent ||
                (window.innerWidth <= 700 &&
                  control.getBoundingClientRect().height < 44)
              )
                throw new Error(
                  "Dense atlas lost full labels or usable controls",
                );
            }
            const labels = Array.from(
              document.querySelectorAll<SVGTextElement>(
                "[data-knowledge-label]",
              ),
            );
            if (labels.length !== 7)
              throw Error("Dense atlas lost its seven source labels");
            for (const label of labels) {
              if (
                label.querySelector("title")?.textContent !==
                  label.getAttribute("aria-label") ||
                label.getAttribute("data-label-truncated") !== "true"
              )
                throw Error(
                  "Crowded label lost its full source title or explicit truncation",
                );
              const box = label.getBBox();
              if (
                box.x < 4 ||
                box.x + box.width > 816 ||
                box.y < 0 ||
                box.y + box.height > 480
              )
                throw Error("Territory label is outside its SVG bounds");
              for (const other of labels) {
                if (other === label) continue;
                const target = other.getBBox();
                if (
                  box.x < target.x + target.width + 2 &&
                  box.x + box.width + 2 > target.x &&
                  box.y < target.y + target.height + 2 &&
                  box.y + box.height + 2 > target.y
                )
                  throw Error("Dense territory labels overlap");
              }
            }
            index.scrollIntoView({ block: "start" });
          });
          await writeFile(
            path.join(
              ARTIFACT_DIR,
              `dashboard-knowledge-index-dense-${viewport.width}x${viewport.height}-${climate}.png`,
            ),
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
        }
        const name = `${surface}-${viewport.width}x${viewport.height}-${climate}.png`;
        await recordVisualCapture(name, image);
        if (surface === "studio-chat" || surface === "studio-account")
          await verifyStudioProfileNavigation(page, surface);
        if (surface === "studio-chat") {
          const attachmentUrl = new URL(
            await page.evaluate<string>("location.href"),
          );
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
          await page.cdp("Input.dispatchKeyEvent", {
            type: "keyDown",
            key: "Escape",
            code: "Escape",
            windowsVirtualKeyCode: 27,
          });
          await page.cdp("Input.dispatchKeyEvent", {
            type: "keyUp",
            key: "Escape",
            code: "Escape",
            windowsVirtualKeyCode: 27,
          });
          await waitForPage("image preview focus restoration", () =>
            evaluatePage(
              page,
              () =>
                !document.querySelector('[role="dialog"]') &&
                document.activeElement?.matches(
                  ".studio-chat-image-trigger",
                ) === true,
            ),
          );
          const attachmentName = `studio-chat-attachments-${viewport.width}x${viewport.height}-${climate}`;
          await auditStudioAccessibility(page, attachmentName);
          await recordVisualCapture(
            `${attachmentName}.png`,
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
        }
        page.close();
      }
    }
  }
} finally {
  Bun.WebView.closeAll();
  await fixtureServer.stop();
}

if (failures.length > 0) {
  throw new Error(
    `Console visual regression failed:\n${failures.join("\n")}\nReview artifacts in ${ARTIFACT_DIR}.`,
  );
}
console.log(
  UPDATE
    ? `Updated console baselines in ${BASELINE_DIR}`
    : "Console visual regression passed.",
);
