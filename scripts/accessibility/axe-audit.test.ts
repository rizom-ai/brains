import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { countByImpact, runAxeAudit } from "./axe-audit";
import { chromeBackend, chromeProfile } from "./browser";

const CHROMIUM_PATH = process.env["CONSOLE_CHROMIUM_PATH"];

const page = (body: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixture</title></head><body><main><h1>Fixture</h1>${body}</main></body></html>`;

const FIXTURES: Record<string, string> = {
  "/clean": page(`<label for="name">Name</label><input id="name" type="text">`),
  "/missing-label": page(`<input type="text">`),
};

describe("countByImpact", () => {
  it("counts violations and their nodes per impact", () => {
    expect(
      countByImpact([
        { impact: "critical", nodes: [{}, {}] },
        { impact: "serious", nodes: [{}] },
        { nodes: [{}] },
      ]),
    ).toEqual({
      critical: { rules: 1, nodes: 2 },
      serious: { rules: 1, nodes: 1 },
      moderate: { rules: 0, nodes: 0 },
      minor: { rules: 1, nodes: 1 },
    });
  });
});

describe.skipIf(!CHROMIUM_PATH)("runAxeAudit", () => {
  let server: ReturnType<typeof Bun.serve>;
  let view: Bun.WebView;

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: (request) => {
        const html = FIXTURES[new URL(request.url).pathname];
        return html
          ? new Response(html, { headers: { "Content-Type": "text/html" } })
          : new Response("Not found", { status: 404 });
      },
    });
    view = new Bun.WebView({
      width: 1280,
      height: 800,
      backend: chromeBackend(CHROMIUM_PATH ?? ""),
      dataStore: chromeProfile(),
    });
  });

  // Only this suite's view closes: test files share one Chrome process.
  afterAll(async () => {
    view.close();
    await server.stop(true);
  });

  it("names a form field without a label as a critical violation", async () => {
    await view.navigate(new URL("/missing-label", server.url).href);

    const audit = await runAxeAudit(view);

    expect(audit.violations.map((violation) => violation.id)).toEqual([
      "label",
    ]);
    expect(countByImpact(audit.violations).critical.nodes).toBe(1);
  });

  it("finds no violation on a labelled page", async () => {
    await view.navigate(new URL("/clean", server.url).href);

    const audit = await runAxeAudit(view);

    expect(audit.violations).toEqual([]);
    expect(audit.passedRules).toContain("label");
  });
});
