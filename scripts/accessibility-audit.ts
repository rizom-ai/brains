/**
 * Runs the repo's axe audit (WCAG 2.0–2.2, A and AA) on live pages.
 *
 *   bun run a11y:audit -- <url>… [--passkey <file>] [--setup <url>]
 *     [--viewports 1280x800,390x844] [--climate instrument|paper] [--json <file>]
 *
 * Pages behind a Studio sign-in are audited as the signed-in owner, through
 * Chrome's virtual authenticator. `--setup` takes a brain's one-time
 * `/setup?token=…` link and registers a new passkey; otherwise the brain's
 * `/login` page signs in with the passkey saved in `--passkey`. The file
 * keeps the passkey's private key: use it only with a local test app.
 * `--climate` sets the console's stored climate before each page loads;
 * without it the page keeps its own default.
 *
 * Exits non-zero when any page has a critical or serious violation. Findings
 * and decisions are recorded in `docs/accessibility-audit.md`.
 */
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "@brains/utils/zod";
import {
  IMPACTS,
  countByImpact,
  runAxeAudit,
  type AxeAudit,
  type ImpactCounts,
} from "./accessibility/axe-audit";
import { chromeBackend, waitForQuietDom } from "./accessibility/browser";
import { clickSelector, waitForPage } from "./console-visual/page";

const { values, positionals: urls } = parseArgs({
  allowPositionals: true,
  options: {
    passkey: { type: "string" },
    setup: { type: "string" },
    climate: { type: "string" },
    viewports: { type: "string", default: "1280x800,390x844" },
    json: { type: "string" },
  },
});

const executablePath =
  process.env["CONSOLE_CHROMIUM_PATH"] ?? Bun.which("google-chrome-stable");
if (!executablePath)
  throw new Error("Set CONSOLE_CHROMIUM_PATH to a Chromium executable.");
if (urls.length === 0)
  throw new Error(
    "Usage: bun run a11y:audit -- <url>… [--passkey <file>] [--setup <url>]",
  );

const viewports = values.viewports.split(",").map((size) => {
  const [width, height] = size.split("x").map(Number);
  if (!width || !height) throw new Error(`Invalid viewport: ${size}`);
  return { width, height };
});

/** One profile for the run, so a sign-in reaches every view. */
const profile = await mkdtemp(path.join(tmpdir(), "a11y-audit-"));

function openView(viewport: { width: number; height: number }): Bun.WebView {
  return new Bun.WebView({
    ...viewport,
    backend: chromeBackend(executablePath ?? ""),
    dataStore: { directory: profile },
  });
}

const passkeyFileSchema = z.array(z.record(z.string(), z.unknown()));

/**
 * Signs in with a virtual passkey: registered on `--setup`, or loaded from
 * `--passkey` and offered on the brain's `/login`. The passkey, with its
 * new sign count, is written back to `--passkey` for the next run.
 */
async function signIn(origin: string): Promise<void> {
  const page = openView({ width: 1280, height: 800 });
  try {
    // CDP commands need a page session, which the first navigation opens.
    await page.navigate("about:blank");
    await page.cdp("WebAuthn.enable");
    const { authenticatorId } = await page.cdp<{ authenticatorId: string }>(
      "WebAuthn.addVirtualAuthenticator",
      {
        options: {
          protocol: "ctap2",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      },
    );
    const passkeyFile = values.passkey ? Bun.file(values.passkey) : undefined;
    const saved =
      passkeyFile && (await passkeyFile.exists())
        ? passkeyFileSchema.parse(await passkeyFile.json())
        : [];
    await Promise.all(
      saved.map((credential) =>
        page.cdp("WebAuthn.addCredential", { authenticatorId, credential }),
      ),
    );
    if (values.setup) {
      await page.navigate(values.setup);
      await clickSelector(page, "#register");
    } else {
      await page.navigate(new URL("/login", origin).href);
      await clickSelector(page, "#login");
    }
    await waitForPage("passkey sign-in", () =>
      Promise.resolve(!/^\/(setup|login)/.test(new URL(page.url).pathname)),
    );
    if (passkeyFile) {
      const { credentials } = await page.cdp<{ credentials: unknown[] }>(
        "WebAuthn.getCredentials",
        { authenticatorId },
      );
      await Bun.write(passkeyFile, JSON.stringify(credentials, null, 2));
    }
  } finally {
    page.close();
  }
}

interface PageAudit {
  url: string;
  /** Where the page ended up, after any sign-in redirect. */
  finalUrl: string;
  viewport: string;
  counts: ImpactCounts;
  violations: AxeAudit["violations"];
  incomplete: AxeAudit["incomplete"];
}

async function auditPage(
  url: string,
  viewport: { width: number; height: number },
): Promise<PageAudit> {
  const page = openView(viewport);
  try {
    if (values.climate) {
      await page.navigate("about:blank");
      await page.cdp("Page.addScriptToEvaluateOnNewDocument", {
        source: `localStorage.setItem("console.climate", ${JSON.stringify(values.climate)})`,
      });
    }
    await page.navigate(url);
    await waitForQuietDom(page);
    const audit = await runAxeAudit(page);
    return {
      url,
      finalUrl: page.url,
      viewport: `${viewport.width}x${viewport.height}`,
      counts: countByImpact(audit.violations),
      violations: audit.violations,
      incomplete: audit.incomplete,
    };
  } finally {
    page.close();
  }
}

if (values.setup || values.passkey) await signIn(urls[0] ?? "");

const audits = await urls.reduce<Promise<PageAudit[]>>(
  async (done, url) => [
    ...(await done),
    ...(await viewports.reduce<Promise<PageAudit[]>>(
      async (perViewport, viewport) => [
        ...(await perViewport),
        await auditPage(url, viewport),
      ],
      Promise.resolve([]),
    )),
  ],
  Promise.resolve([]),
);
Bun.WebView.closeAll();

for (const audit of audits) {
  const redirected = audit.finalUrl !== audit.url ? ` → ${audit.finalUrl}` : "";
  console.log(
    `\n${audit.url}${redirected} @ ${audit.viewport}${values.climate ? ` · ${values.climate}` : ""}`,
  );
  console.log(
    `  ${IMPACTS.map((impact) => `${impact} ${audit.counts[impact].rules} (${audit.counts[impact].nodes})`).join(" · ")} · incomplete ${audit.incomplete.length}`,
  );
  for (const violation of audit.violations)
    console.log(
      `  - ${violation.impact ?? "minor"} ${violation.id} (${violation.nodes.length}): ${violation.help}\n      ${violation.nodes
        .slice(0, 3)
        .map((node) => node.target.join(" "))
        .join("\n      ")}`,
    );
}

if (values.json) await writeFile(values.json, JSON.stringify(audits, null, 2));

const blocking = audits.filter(
  (audit) => audit.counts.critical.rules + audit.counts.serious.rules > 0,
);
if (blocking.length > 0) {
  console.error(
    `\n${blocking.length} of ${audits.length} page audits have critical or serious violations.`,
  );
  process.exitCode = 1;
}
