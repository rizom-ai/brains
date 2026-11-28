import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";
import { FIXTURE_THEMES } from "../console-visual/fixture-themes";
import type { FixtureServer } from "../console-visual/fixture-server";
import { runAxeAudit } from "./axe-audit";
import { chromeBackend, chromeProfile, waitForQuietDom } from "./browser";

const CHROMIUM_PATH = process.env["CONSOLE_CHROMIUM_PATH"];
// The fixture serves Studio's built UI; CI builds it before this test runs.
const STUDIO_BUILT = existsSync(
  path.resolve(import.meta.dir, "../../plugins/studio/dist/ui"),
);

const CLIMATES = ["instrument", "paper"] as const;
/** Chat, an open entry with its fields, and the overview's timeline and cards. */
const SURFACES = [
  "/chat",
  "/studio/entities/posts/field-notes",
  `/studio/workspaces/${encodeURIComponent("studio:overview")}`,
];

/**
 * Studio takes its colors from the brain's site theme, so a theme that reads
 * well on its own site can still fail Studio's small text. Every shipped
 * theme, in both climates, keeps Studio free of critical and serious axe
 * violations at desktop width, where the rail shows its section numbers.
 */
describe.skipIf(!CHROMIUM_PATH || !STUDIO_BUILT)(
  "Studio in every site theme",
  () => {
    let server: FixtureServer;

    beforeAll(async () => {
      // Imported here: the fixture serves Studio, which loads built UI
      // packages that a run without them (skipping this suite) never has.
      const { startFixtureServer } =
        await import("../console-visual/fixture-server");
      server = await startFixtureServer();
    });

    // Each case closes its own page: test files share one Chrome process.
    afterAll(async () => {
      await server.stop();
    });

    const cases = Object.keys(FIXTURE_THEMES).flatMap((theme) =>
      CLIMATES.map((climate) => [theme, climate] as const),
    );

    test.each(cases)(
      "%s theme, %s climate: no critical or serious violation",
      async (theme, climate) => {
        const page = new Bun.WebView({
          width: 1280,
          height: 800,
          backend: chromeBackend(CHROMIUM_PATH ?? ""),
          dataStore: chromeProfile(),
        });
        await page.navigate("about:blank");
        await page.cdp("Page.addScriptToEvaluateOnNewDocument", {
          source: `localStorage.setItem("console.climate", ${JSON.stringify(climate)})`,
        });
        const findings = await SURFACES.reduce<Promise<string[]>>(
          async (done, surface) => {
            // One page, one surface at a time.
            const earlier = await done;
            await page.navigate(
              `${server.origin}${surface}?climate=${climate}&theme=${theme}`,
            );
            await waitForQuietDom(page);
            const { violations } = await runAxeAudit(page);
            return [
              ...earlier,
              ...violations
                .filter(
                  (violation) =>
                    violation.impact === "critical" ||
                    violation.impact === "serious",
                )
                .flatMap((violation) =>
                  violation.nodes.map(
                    (node) =>
                      `${surface} ${violation.id} ${node.target.join(" ")}: ${[...node.any, ...node.all, ...node.none].map((check) => check.message).join("; ")}`,
                  ),
                ),
            ];
          },
          Promise.resolve([]),
        );
        page.close();

        expect(findings).toEqual([]);
      },
      90_000,
    );
  },
);
