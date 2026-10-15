import { writeFile } from "node:fs/promises";
import path from "node:path";
import axe from "axe-core";
import { getErrorMessage } from "@brains/utils/error";
import {
  ARTIFACT_DIR,
  AUDIT_ACCESSIBILITY,
  BASELINE_DIR,
  FIXED_NOW,
  STUDY_STATE,
  UPDATE,
} from "./options";
import { evaluatePage } from "./page";
import { CHANGED_PIXEL_THRESHOLD, comparePng } from "./png";

/** One surface, at one viewport, in one climate, open in its own page. */
export interface VisualCase {
  page: Bun.WebView;
  surface: string;
  viewport: { readonly width: number; readonly height: number };
  climate: string;
  /** `http://127.0.0.1:<port>` of the fixture server. */
  origin: string;
}

/** Comparison and audit failures, reported together once every case ran. */
export const failures: string[] = [];

export async function openCapturePage(
  viewport: VisualCase["viewport"],
  backend: Bun.WebView.Backend,
  origin: string,
  conversation: string,
): Promise<Bun.WebView> {
  const page = new Bun.WebView({
    width: viewport.width,
    height: viewport.height,
    backend,
  });
  await page.navigate("about:blank");
  // Each capture starts from a fresh fixture preference. The browser backend
  // can reuse storage across WebViews; collapsed captures must not seed the next case.
  await page.cdp("Storage.clearDataForOrigin", {
    origin,
    storageTypes: "local_storage",
  });
  await page.cdp("Emulation.setLocaleOverride", { locale: "en-GB" });
  await page.cdp("Emulation.setTimezoneOverride", { timezoneId: "UTC" });
  await addVisualInitScript(page, conversation);
  return page;
}

async function addVisualInitScript(
  page: Bun.WebView,
  conversation: string,
): Promise<void> {
  await page.cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      Date.now = () => ${FIXED_NOW};
      localStorage.setItem(
        "console.climate",
        new URL(location.href).searchParams.get("climate") ?? "instrument",
      );
      if (${JSON.stringify(STUDY_STATE !== "empty")}) localStorage.setItem(
        "brain:web-chat:conversation-id",
        ${JSON.stringify(conversation)},
      );
    })()`,
  });
}

export async function settleVisualCapture(page: Bun.WebView): Promise<void> {
  await evaluatePage(page, async () => {
    await document.fonts.ready;
    const style = document.createElement("style");
    style.textContent =
      "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;caret-color:transparent!important}";
    document.head.append(style);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

export async function screenshot(page: Bun.WebView): Promise<Buffer> {
  return page.screenshot({ encoding: "buffer", format: "png" });
}

/** Compares a capture with its baseline, or replaces the baseline on --update. */
export async function recordVisualCapture(
  name: string,
  image: Buffer,
): Promise<void> {
  const baselinePath = path.join(BASELINE_DIR, name);
  if (UPDATE) {
    const ratio = await comparePng(image, baselinePath).catch(() => 1);
    if (ratio > CHANGED_PIXEL_THRESHOLD) await writeFile(baselinePath, image);
  } else {
    // Keep CI-native evidence even when small, intentional changes (for
    // example rail marks) fall below the whole-page comparison threshold.
    await writeFile(path.join(ARTIFACT_DIR, name), image);
    try {
      const ratio = await comparePng(image, baselinePath);
      if (ratio > CHANGED_PIXEL_THRESHOLD) {
        failures.push(`${name}: ${(ratio * 100).toFixed(2)}% pixels changed`);
      }
    } catch (error) {
      failures.push(`${name}: ${getErrorMessage(error)}`);
    }
  }
}

/** Writes review evidence that has no committed baseline. */
export async function saveArtifactScreenshot(
  page: Bun.WebView,
  name: string,
): Promise<void> {
  await writeFile(path.join(ARTIFACT_DIR, name), await screenshot(page));
}

export async function auditStudioAccessibility(
  page: Bun.WebView,
  name: string,
): Promise<void> {
  if (!AUDIT_ACCESSIBILITY) return;
  await page.evaluate(`(() => { ${axe.source}; return true; })()`);
  const audit = await evaluatePage(page, async () => {
    const runtime = (globalThis as unknown as { axe: typeof axe }).axe;
    const result = await runtime.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
      },
    });
    return {
      violations: result.violations,
      incomplete: result.incomplete,
      passedRules: result.passes.map((rule) => rule.id),
    };
  });
  await writeFile(
    path.join(ARTIFACT_DIR, `${name}-a11y.json`),
    JSON.stringify(audit, null, 2),
  );
  if (audit.violations.length)
    failures.push(
      `${name}: accessibility ${audit.violations.map((violation) => `${violation.id} (${violation.nodes.length})`).join(", ")}`,
    );
}
