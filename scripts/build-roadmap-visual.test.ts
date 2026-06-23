import { describe, expect, test } from "bun:test";
import {
  parseRoadmap,
  renderHtml,
  resolveStatus,
} from "./build-roadmap-visual";

describe("resolveStatus", () => {
  test("parked wins over everything", () => {
    expect(resolveStatus("Parked future plan. Do not implement yet.")).toBe(
      "parked",
    );
    expect(resolveStatus("Parked strategy plan.")).toBe("parked");
  });

  test("partial when implemented work has remaining targets", () => {
    expect(
      resolveStatus(
        "Phase 1 foundation is implemented. Remaining active targets are OAuth.",
      ),
    ).toBe("partial");
    expect(resolveStatus("Partial. Remaining sidecar work.")).toBe("partial");
    expect(resolveStatus("Service shipped; consumers are pending.")).toBe(
      "partial",
    );
    expect(
      resolveStatus(
        "The harness has landed and merged to main. Remaining work is coverage.",
      ),
    ).toBe("partial");
  });

  test("active for an active plan with no remaining-implemented signal", () => {
    expect(resolveStatus("Active. Relay reference plan.")).toBe("active");
  });

  test("proposed is the default", () => {
    expect(resolveStatus("Proposed.")).toBe("proposed");
    expect(resolveStatus("Proposed / exploratory.")).toBe("proposed");
    expect(resolveStatus("Accepted direction.")).toBe("proposed");
    expect(
      resolveStatus("Reference backlog. Findings from the shell audit."),
    ).toBe("proposed");
  });

  test("a leading status token wins over an incidental keyword later", () => {
    expect(
      resolveStatus(
        "Proposed, refined against the current implemented baseline.",
      ),
    ).toBe("proposed");
  });
});

const SAMPLE = `# brains roadmap

Last updated: 2026-06-23

## Recently completed

These areas are effectively landed:

- **Runtime baseline** — Alpha CLI and runtime.
- **Plugin architecture** — Entity/Service/Interface split.

## Strategic roadmap

> **Rover stays standalone; Relay proves the team brain.**

### 1. Keep Rover sharp

Some prose here.

Plans:

- [rover-core-preset-evals.md](./plans/rover-core-preset-evals.md) — eval harness.
- [web-search-tool.md](./plans/web-search-tool.md) — web_search capability.

### 2. Prove shared Relay

Plans:

- [relay-presets.md](./plans/relay-presets.md) — Relay preset philosophy.

## Product direction

Not a section.
`;

const PLAN_FIXTURES: Record<string, string> = {
  "rover-core-preset-evals.md":
    "# Plan: Exhaustive core-preset eval set\n\n## Status\n\nThe harness has landed and merged to main. Remaining work is coverage.\n",
  "web-search-tool.md": "# Plan: Web search tool\n\n## Status\n\nProposed.\n",
  "relay-presets.md":
    "# Plan: Relay Presets — Current & Future\n\n## Status\n\nActive. Relay reference plan.\n",
};

const readPlan = (file: string): string | null => PLAN_FIXTURES[file] ?? null;

describe("parseRoadmap", () => {
  const model = parseRoadmap(SAMPLE, readPlan);

  test("extracts the updated date", () => {
    expect(model.updated).toBe("2026-06-23");
  });

  test("captures the §1–§N sections, stopping at the next H2", () => {
    expect(model.sections.map((s) => s.n)).toEqual(["1", "2"]);
    expect(model.sections[0]?.title).toBe("Keep Rover sharp");
  });

  test("collects plan cards with name from H1, desc from roadmap, status from plan", () => {
    const evals = model.sections[0]?.plans[0];
    expect(evals?.file).toBe("rover-core-preset-evals.md");
    expect(evals?.name).toBe("Exhaustive core-preset eval set");
    expect(evals?.desc).toBe("eval harness.");
    expect(evals?.status).toBe("partial");

    expect(model.sections[0]?.plans[1]?.status).toBe("proposed");
    expect(model.sections[1]?.plans[0]?.status).toBe("active");
  });

  test("captures recently-completed bullets", () => {
    expect(model.completed).toEqual([
      { title: "Runtime baseline", desc: "Alpha CLI and runtime." },
      { title: "Plugin architecture", desc: "Entity/Service/Interface split." },
    ]);
  });

  test("falls back to filename when a plan file is missing", () => {
    const missing = parseRoadmap(
      `## Strategic roadmap\n\n### 1. X\n\nPlans:\n\n- [ghost-plan.md](./plans/ghost-plan.md) — desc.\n`,
      () => null,
    );
    expect(missing.sections[0]?.plans[0]?.name).toBe("ghost-plan");
    expect(missing.sections[0]?.plans[0]?.status).toBe("proposed");
  });
});

describe("renderHtml", () => {
  const html = renderHtml(parseRoadmap(SAMPLE, readPlan));

  test("is deterministic (no wall-clock); same input → same output", () => {
    expect(renderHtml(parseRoadmap(SAMPLE, readPlan))).toBe(html);
  });

  test("marks the file as generated and carries the date", () => {
    expect(html).toContain("GENERATED FILE — do not edit by hand");
    expect(html).toContain("2026-06-23");
  });

  test("renders section titles and status-classed cards", () => {
    expect(html).toContain("Keep Rover sharp");
    expect(html).toContain("Prove shared Relay");
    expect(html).toContain("card status-partial");
    expect(html).toContain("card status-active");
  });

  test("escapes HTML-significant characters and renders inline code", () => {
    const model = parseRoadmap(
      `## Strategic roadmap\n\n### 1. X\n\nPlans:\n\n- [a.md](./plans/a.md) — uses \`<code>\` & needs <escaping>.\n`,
      () => "# Plan: A\n\n## Status\n\nProposed.\n",
    );
    const out = renderHtml(model);
    expect(out).toContain("<code>&lt;code&gt;</code>");
    expect(out).toContain("&amp; needs &lt;escaping&gt;");
  });
});
