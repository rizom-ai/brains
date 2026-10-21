/**
 * Console visual regression: renders the Dashboard and every Studio surface
 * from fixtures, at each viewport and climate, verifies their behavior and
 * layout contracts, and compares each capture with its committed baseline.
 * The harness lives in `scripts/console-visual/`; see
 * `test/visual/console/README.md` for running it.
 */
import { mkdir } from "node:fs/promises";
import { supportsStudioStudyState } from "./fixtures/studio-study-state";
import { systemFixtures } from "./fixtures/studio-system";
import {
  type VisualCase,
  auditStudioAccessibility,
  failures,
  openCapturePage,
  recordVisualCapture,
  screenshot,
  settleVisualCapture,
} from "./console-visual/capture";
import {
  exerciseDashboard,
  verifyDashboardFixtureStates,
} from "./console-visual/dashboard-flows";
import type { FixtureServerState } from "./console-visual/fixture-routes";
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
  clickSelector,
  evaluatePage,
  navigateToNetworkIdle,
  waitForPage,
  waitForText,
  waitForVisualStability,
} from "./console-visual/page";
import { runStudyStateCase } from "./console-visual/study-states";
import { CASE_DEADLINE_MS, withDeadline } from "./console-visual/case-deadline";
import {
  exerciseStudioChat,
  verifyChatAttachments,
} from "./console-visual/studio-chat-flows";
import {
  verifyAdministrationRecords,
  verifyDirectStudioNavigation,
  verifyDisabledPrimaries,
  verifyRecordTypography,
  verifyStudioKeyboardAccess,
  verifyStudioMobileSwitcher,
  verifyStudioProfileNavigation,
} from "./console-visual/studio-checks";
import {
  captureEditorProperties,
  captureSystemBody,
  exerciseStudioConflict,
  exerciseStudioDelete,
  exerciseStudioEditor,
  exerciseStudioInvalid,
  exerciseStudioUpload,
  exerciseSystemBodyModes,
  verifySystemSavePayload,
} from "./console-visual/studio-editor-flows";
import {
  exerciseContentSync,
  exerciseStudioAccount,
  exerciseStudioLibrary,
  exerciseStudioNavigation,
  exerciseStudioPublishing,
  exerciseStudioSite,
} from "./console-visual/studio-workspace-flows";
import {
  type SurfacePlan,
  consoleSurfaces,
  planSurface,
} from "./console-visual/surfaces";

/** Interactions that bring a surface into the state its capture pins. */
async function exerciseSurface(
  visualCase: VisualCase,
  plan: SurfacePlan,
): Promise<void> {
  const { page, surface, viewport, climate } = visualCase;
  if (
    surface === "studio-system" &&
    viewport.width <= 640 &&
    climate === "instrument"
  )
    await exerciseSystemBodyModes(page);
  if (surface.startsWith("studio-navigation"))
    await exerciseStudioNavigation(visualCase);
  if (
    surface === "studio-overview" &&
    viewport.width <= 640 &&
    climate === "instrument"
  )
    await verifyStudioMobileSwitcher(page);
  if (surface.startsWith("studio-chat")) await exerciseStudioChat(visualCase);
  if (plan.isDashboard) await exerciseDashboard(visualCase);
  if (surface === "studio-library") await exerciseStudioLibrary(visualCase);
  if (surface === "studio-overview") await waitForText(page, "Recent activity");
  if (surface === "studio-content-sync") await exerciseContentSync(visualCase);
  if (surface === "studio-site") await exerciseStudioSite(page);
  if (surface === "studio-publishing") await exerciseStudioPublishing(page);
  if (
    surface === "studio-content-sync" ||
    surface === "studio-inbox" ||
    surface === "studio-overview"
  )
    await verifyRecordTypography(page);
  if (surface === "studio-account") await exerciseStudioAccount(visualCase);
  if (surface === "studio-administration-invitations-form")
    await clickSelector(page, ".declarative-action-disclosure");
  if (surface === "studio-delete") await exerciseStudioDelete(visualCase);
  if (surface === "studio-editor") await exerciseStudioEditor(visualCase);
  if (surface === "studio-conflict") await exerciseStudioConflict(page);
  if (surface === "studio-invalid") await exerciseStudioInvalid(visualCase);
  if (surface === "studio-upload") await exerciseStudioUpload(page);
  if (
    ["studio-chat", "studio-administration", "studio-account"].includes(surface)
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
}

/**
 * Verifies the settled surface, captures it, runs the follow-up checks that
 * leave the captured state, then records the capture.
 */
async function captureSurface(
  visualCase: VisualCase,
  state: FixtureServerState,
): Promise<void> {
  const { page, surface, viewport, climate } = visualCase;
  await evaluatePage(page, () => document.fonts.ready);
  await waitForVisualStability(page);
  await checkLayout(page, surface, viewport.width, viewport.height);
  if (surface.startsWith("studio-")) await verifyStudioKeyboardAccess(page);
  if (surface.startsWith("studio-"))
    await auditStudioAccessibility(
      page,
      `${surface}-${viewport.width}x${viewport.height}-${climate}`,
    );
  await settleVisualCapture(page);
  await verifyDisabledPrimaries(page);
  const image = await screenshot(page);
  if (surface === "studio-editor") await captureEditorProperties(visualCase);
  if (surface === "studio-system" || surface === "studio-system-anchor-profile")
    await captureSystemBody(visualCase);
  if (
    surface === "studio-system" &&
    viewport.width === 1440 &&
    climate === "instrument"
  )
    await verifySystemSavePayload(page, state);
  if (surface === "dashboard") await verifyDashboardFixtureStates(visualCase);
  const name = `${surface}-${viewport.width}x${viewport.height}-${climate}.png`;
  await recordVisualCapture(name, image);
  if (surface === "studio-chat" || surface === "studio-account")
    await verifyStudioProfileNavigation(page, surface);
  if (surface === "studio-chat") await verifyChatAttachments(visualCase);
}

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
        const caseName = `${surface} ${viewport.width}x${viewport.height} ${climate}`;
        console.error(`→ ${caseName}`);
        await withDeadline(
          (async (): Promise<void> => {
            fixtureServer.state.reviewingSystem = plan.reviewingSystem;
            const page = await openCapturePage(
              viewport,
              browserBackend,
              fixtureServer.origin,
              "responsive",
            );
            const visualCase: VisualCase = {
              page,
              surface,
              viewport,
              climate,
              origin: fixtureServer.origin,
            };
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
              await runStudyStateCase(visualCase, STUDY_STATE);
              page.close();
              return;
            }
            await exerciseSurface(visualCase, plan);
            await captureSurface(visualCase, fixtureServer.state);
            page.close();
          })(),
          CASE_DEADLINE_MS,
          caseName,
        );
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
