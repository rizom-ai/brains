#!/usr/bin/env bun
/**
 * Generates docs/roadmap-visual.html from docs/roadmap.md.
 *
 * roadmap.md is the single source of truth. This script parses its §1–§N
 * sections, the plan links under each, and each plan's `## Status`, then renders
 * a static status board. Output is deterministic (the date comes from the
 * markdown, never the wall clock) so a drift check can diff it byte-for-byte.
 *
 *   bun scripts/build-roadmap-visual.ts          # write the HTML
 *   bun scripts/build-roadmap-visual.ts --check  # fail if the HTML is stale
 *
 * The drift check runs as part of `bun run docs:check` and in the pre-commit
 * hook, so the visual cannot silently fall out of sync with roadmap.md.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DOCS_DIR = join(import.meta.dir, "..", "docs");
const ROADMAP_MD = join(DOCS_DIR, "roadmap.md");
const PLANS_DIR = join(DOCS_DIR, "plans");
const OUTPUT_HTML = join(DOCS_DIR, "roadmap-visual.html");

export type StatusBucket =
  | "active"
  | "partial"
  | "proposed"
  | "parked"
  | "done";

export interface PlanCard {
  file: string;
  name: string;
  desc: string;
  status: StatusBucket;
  statusText: string;
}

export interface Section {
  n: string;
  title: string;
  plans: PlanCard[];
}

export interface RoadmapModel {
  title: string;
  updated: string;
  storyArc: string;
  sections: Section[];
  completed: { title: string; desc: string }[];
}

const STATUS_META: Record<StatusBucket, { label: string }> = {
  active: { label: "Active" },
  partial: { label: "In progress" },
  proposed: { label: "Proposed" },
  parked: { label: "Parked" },
  done: { label: "Done" },
};

/**
 * Maps a plan's `## Status` prose to a coarse bucket. Order matters: "parked"
 * always wins, and implemented-but-incomplete work is "partial" before we
 * consider a bare "active"/"done" signal.
 */
export function resolveStatus(statusText: string): StatusBucket {
  const t = statusText.toLowerCase().trim();

  // These plans conventionally lead with their status token; trust it first so
  // a "Proposed" plan that merely mentions an "implemented baseline" elsewhere
  // is not misread as shipped.
  if (t.startsWith("parked")) return "parked";
  if (t.startsWith("partial")) return "partial";
  if (
    t.startsWith("proposed") ||
    t.startsWith("accepted") ||
    t.startsWith("reference")
  ) {
    return "proposed";
  }
  if (t.startsWith("active")) return "active";
  if (t.startsWith("done") || t.startsWith("complete")) return "done";

  // Otherwise infer from the full status prose.
  const hasRemaining = /\b(remaining|pending|deferred)\b/.test(t);
  const hasShipped =
    /\b(implemented|merged|landed|shipped|live|deployed|released)\b/.test(t);

  if (t.includes("parked")) return "parked";
  if (
    t.includes("service shipped") ||
    t.includes("first bounded") ||
    (hasShipped && hasRemaining)
  ) {
    return "partial";
  }
  if (/\bactive\b/.test(t)) return "active";
  if (hasShipped && !hasRemaining) return "done";
  return "proposed";
}

function planName(file: string, planSource: string | null): string {
  if (planSource) {
    const h1 = planSource.match(/^#\s+(.+?)\s*$/m);
    if (h1?.[1]) return h1[1].replace(/^Plan:\s*/i, "").trim();
  }
  return file.replace(/\.md$/, "");
}

function planStatusText(planSource: string | null): string {
  if (!planSource) return "Proposed.";
  const m = planSource.match(/^##\s+Status\s*$/m);
  if (m?.index === undefined) return "Proposed.";
  const after = planSource.slice(m.index + m[0].length);
  const nextH2 = after.search(/\n##\s/);
  const block = (nextH2 === -1 ? after : after.slice(0, nextH2)).trim();
  // Whole status block (whitespace-collapsed) so resolveStatus sees later
  // qualifiers like "Remaining work …" that follow the opening paragraph.
  return block.replace(/\s+/g, " ").trim();
}

export function parseRoadmap(
  md: string,
  readPlan: (file: string) => string | null,
): RoadmapModel {
  const lines = md.split("\n");

  const updated = (md.match(/^Last updated:\s*(.+?)\s*$/m)?.[1] ?? "").trim();
  const storyArc = (
    md.match(/^>\s*\*\*(.+?)\*\*\s*$/m)?.[1] ??
    md.match(/^>\s*(.+?)\s*$/m)?.[1] ??
    ""
  ).trim();

  const sections: Section[] = [];
  const completed: { title: string; desc: string }[] = [];

  let inStrategic = false;
  let inCompleted = false;
  let current: Section | null = null;

  const planLine = /^-\s+\[[^\]]+\]\(\.\/plans\/([^)]+)\)\s*—\s*(.+?)\s*$/;
  const completedLine = /^-\s+\*\*(.+?)\*\*\s*—\s*(.+?)\s*$/;

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (/^##\s+Recently completed\s*$/.test(line)) {
      inCompleted = true;
      inStrategic = false;
      current = null;
      continue;
    }
    if (/^##\s+Strategic roadmap\s*$/.test(line)) {
      inStrategic = true;
      inCompleted = false;
      continue;
    }
    if (/^##\s+/.test(line)) {
      // any other H2 ends both regions
      if (current) sections.push(current);
      current = null;
      inStrategic = false;
      inCompleted = false;
      continue;
    }

    if (inCompleted) {
      const c = line.match(completedLine);
      if (c?.[1] && c[2]) {
        completed.push({ title: c[1].trim(), desc: c[2].trim() });
      }
      continue;
    }

    if (inStrategic) {
      const h = line.match(/^###\s+(\d+)\.\s+(.+?)\s*$/);
      if (h?.[1] && h[2]) {
        if (current) sections.push(current);
        current = { n: h[1], title: h[2].trim(), plans: [] };
        continue;
      }
      const p = line.match(planLine);
      if (p?.[1] && p[2] && current) {
        const file = p[1];
        const desc = p[2].trim();
        const source = readPlan(file);
        const statusText = planStatusText(source);
        current.plans.push({
          file,
          name: planName(file, source),
          desc,
          status: resolveStatus(statusText),
          statusText,
        });
      }
    }
  }
  if (current) sections.push(current);

  return {
    title: "Brains Strategic Roadmap",
    updated,
    storyArc,
    sections,
    completed,
  };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escape, then render `inline code` spans. */
function inline(s: string): string {
  return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function renderHtml(model: RoadmapModel): string {
  const order: StatusBucket[] = [
    "active",
    "partial",
    "proposed",
    "parked",
    "done",
  ];

  const legend = order
    .map(
      (s) =>
        `<span class="legend-item"><span class="legend-dot dot-${s}"></span>${STATUS_META[s].label}</span>`,
    )
    .join("\n        ");

  const sortPlans = (plans: PlanCard[]): PlanCard[] =>
    [...plans].sort(
      (a, b) => order.indexOf(a.status) - order.indexOf(b.status),
    );

  const sectionsHtml = model.sections
    .map((sec) => {
      const cards = sortPlans(sec.plans)
        .map(
          (p) => `        <div class="card status-${p.status}">
          <div class="card-head">
            <span class="card-name">${inline(p.name)}</span>
            <span class="badge badge-${p.status}">${STATUS_META[p.status].label}</span>
          </div>
          <div class="card-desc">${inline(p.desc)}</div>
          <div class="card-file">${esc(p.file)}</div>
        </div>`,
        )
        .join("\n");
      return `      <section class="group">
        <h2 class="group-title"><span class="group-num">§${sec.n}</span>${esc(sec.title)}</h2>
        <div class="cards">
${cards}
        </div>
      </section>`;
    })
    .join("\n");

  const completedHtml = model.completed.length
    ? `      <section class="group group-completed">
        <h2 class="group-title"><span class="group-num">✓</span>Recently completed</h2>
        <div class="completed-list">
${model.completed
  .map(
    (c) =>
      `          <div class="completed-item"><span class="completed-name">${inline(
        c.title,
      )}</span> — ${inline(c.desc)}</div>`,
  )
  .join("\n")}
        </div>
      </section>`
    : "";

  return `<!doctype html>
<!--
  GENERATED FILE — do not edit by hand.
  Source: docs/roadmap.md  →  bun scripts/build-roadmap-visual.ts
  Regenerate with: bun run roadmap:build   (drift-guarded by bun run roadmap:check)
-->
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(model.title)}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        background: #0d1117; color: #c9d1d9; line-height: 1.5;
      }
      .header { padding: 32px 40px 16px; border-bottom: 1px solid #21262d; }
      .header h1 { font-size: 24px; font-weight: 600; color: #f0f6fc; }
      .header p { font-size: 13px; color: #8b949e; margin-top: 6px; max-width: 70ch; }
      .header .updated { font-size: 12px; color: #6e7681; margin-top: 8px; }
      .legend { display: flex; flex-wrap: wrap; gap: 18px; padding: 14px 40px;
        border-bottom: 1px solid #21262d; font-size: 12px; color: #8b949e; }
      .legend-item { display: flex; align-items: center; gap: 6px; }
      .legend-dot { width: 10px; height: 10px; border-radius: 50%; }
      .dot-active { background: #d29922; }
      .dot-partial { background: #8957e5; }
      .dot-proposed { background: #58a6ff; }
      .dot-parked { background: #6e7681; }
      .dot-done { background: #3fb950; }
      main { padding: 28px 40px 64px; }
      .group { margin-bottom: 36px; }
      .group-title { font-size: 16px; color: #f0f6fc; font-weight: 600;
        display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px;
        padding-bottom: 8px; border-bottom: 1px solid #21262d; }
      .group-num { color: #6e7681; font-variant-numeric: tabular-nums; font-size: 14px; }
      .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
      .card { border: 1px solid #21262d; border-left-width: 3px; border-radius: 8px;
        padding: 14px 16px; background: #161b22; }
      .card.status-active { border-left-color: #d29922; }
      .card.status-partial { border-left-color: #8957e5; }
      .card.status-proposed { border-left-color: #58a6ff; }
      .card.status-parked { border-left-color: #6e7681; }
      .card.status-done { border-left-color: #3fb950; }
      .card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
      .card-name { font-size: 14px; font-weight: 600; color: #e6edf3; }
      .badge { font-size: 10px; padding: 2px 8px; border-radius: 10px; white-space: nowrap;
        text-transform: uppercase; letter-spacing: 0.4px; }
      .badge-active { background: #2d2410; color: #d29922; }
      .badge-partial { background: #211633; color: #b48ce8; }
      .badge-proposed { background: #0d1a2d; color: #58a6ff; }
      .badge-parked { background: #1c2026; color: #8b949e; }
      .badge-done { background: #122119; color: #3fb950; }
      .card-desc { font-size: 13px; color: #8b949e; margin-top: 8px; }
      .card-file { font-size: 11px; color: #6e7681; margin-top: 8px; font-family: ui-monospace, monospace; }
      .group-completed .completed-list { display: flex; flex-direction: column; gap: 6px; }
      .completed-item { font-size: 13px; color: #8b949e; }
      .completed-name { color: #c9d1d9; font-weight: 600; }
      code { background: #1c2128; padding: 1px 5px; border-radius: 4px;
        font-family: ui-monospace, monospace; font-size: 0.9em; color: #c9d1d9; }
    </style>
  </head>
  <body>
    <header class="header">
      <h1>${esc(model.title)}</h1>
      ${model.storyArc ? `<p>${inline(model.storyArc)}</p>` : ""}
      <div class="updated">Last updated: ${esc(model.updated)} · generated from docs/roadmap.md</div>
    </header>
    <div class="legend">
        ${legend}
    </div>
    <main>
${sectionsHtml}
${completedHtml}
    </main>
  </body>
</html>
`;
}

function build(): string {
  const md = readFileSync(ROADMAP_MD, "utf8");
  const readPlan = (file: string): string | null => {
    try {
      return readFileSync(join(PLANS_DIR, file), "utf8");
    } catch {
      return null;
    }
  };
  return renderHtml(parseRoadmap(md, readPlan));
}

if (import.meta.main) {
  const check = process.argv.includes("--check");
  const next = build();
  if (check) {
    let current = "";
    try {
      current = readFileSync(OUTPUT_HTML, "utf8");
    } catch {
      // missing output → treat as drift
    }
    if (current !== next) {
      console.error(
        "✖ docs/roadmap-visual.html is out of sync with docs/roadmap.md.\n" +
          "  Run `bun run roadmap:build` and commit the result.",
      );
      process.exit(1);
    }
    console.log("✓ roadmap-visual.html is in sync with roadmap.md");
  } else {
    writeFileSync(OUTPUT_HTML, next);
    console.log(`✓ wrote ${OUTPUT_HTML}`);
  }
}
