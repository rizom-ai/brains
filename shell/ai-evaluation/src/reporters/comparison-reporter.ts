import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { formatAsTable, formatAsList } from "@brains/utils";

import type { IReporter } from "../types";
import type { EvaluationSummary } from "../schemas";

export interface ComparisonReporterOptions {
  outputDirectory: string;
  compareAgainst?: string;
  saveBaseline?: string;
}

interface MetricRow {
  metric: string;
  previous: string;
  current: string;
  delta: string;
}

export class ComparisonReporter implements IReporter {
  constructor(private options: ComparisonReporterOptions) {}

  async report(summary: EvaluationSummary): Promise<void> {
    await mkdir(this.options.outputDirectory, { recursive: true });

    if (this.options.saveBaseline) {
      const baselinePath = join(
        this.options.outputDirectory,
        `${this.options.saveBaseline}.json`,
      );
      await writeFile(baselinePath, JSON.stringify(summary, null, 2), "utf-8");
      console.log(`Baseline saved: ${baselinePath}`);
    }

    const previousPath = this.options.compareAgainst
      ? join(
          this.options.outputDirectory,
          `${this.options.compareAgainst}.json`,
        )
      : join(this.options.outputDirectory, "latest.json");

    if (!existsSync(previousPath)) {
      console.log("No previous results to compare against.");
      return;
    }

    const previousJson = await readFile(previousPath, "utf-8");
    const previous: EvaluationSummary = JSON.parse(previousJson);

    const md = this.renderComparison(summary, previous);
    const comparisonPath = join(this.options.outputDirectory, "comparison.md");
    await writeFile(comparisonPath, md, "utf-8");
    console.log(`\n${md}`);
  }

  renderComparison(
    current: EvaluationSummary,
    previous: EvaluationSummary,
  ): string {
    const parts: string[] = [];

    // Metric deltas table
    const metrics: MetricRow[] = [
      {
        metric: "Pass rate",
        previous: pct(previous.passRate),
        current: pct(current.passRate),
        delta: deltaPts(previous.passRate, current.passRate),
      },
      {
        metric: "Avg tokens",
        previous: String(Math.round(previous.avgMetrics.totalTokens)),
        current: String(Math.round(current.avgMetrics.totalTokens)),
        delta: deltaPct(
          previous.avgMetrics.totalTokens,
          current.avgMetrics.totalTokens,
        ),
      },
      {
        metric: "Avg duration",
        previous: `${(previous.avgMetrics.durationMs / 1000).toFixed(1)}s`,
        current: `${(current.avgMetrics.durationMs / 1000).toFixed(1)}s`,
        delta: deltaPct(
          previous.avgMetrics.durationMs,
          current.avgMetrics.durationMs,
        ),
      },
    ];

    parts.push(
      formatAsTable(metrics, {
        header: "## Comparison: current vs previous",
        columns: [
          { header: "Metric", value: (r) => r.metric },
          { header: "Previous", value: (r) => r.previous, align: "right" },
          { header: "Current", value: (r) => r.current, align: "right" },
          { header: "Delta", value: (r) => r.delta, align: "right" },
        ],
      }),
    );

    // Regressions and fixes
    const previousById = new Map(
      previous.results.map((r) => [r.testCaseId, r]),
    );

    const regressions: string[] = [];
    const fixes: string[] = [];

    for (const cur of current.results) {
      const prev = previousById.get(cur.testCaseId);
      if (!prev) continue;
      if (prev.passed && !cur.passed) regressions.push(cur.testCaseId);
      if (!prev.passed && cur.passed) fixes.push(cur.testCaseId);
    }

    if (regressions.length > 0) {
      parts.push(
        formatAsList<string>(
          regressions.map((id) => `**${id}**: was passing, now failing`),
          { title: (s) => s, header: "### Regressions" },
        ),
      );
    }

    if (fixes.length > 0) {
      parts.push(
        formatAsList<string>(
          fixes.map((id) => `**${id}**: was failing, now passing`),
          { title: (s) => s, header: "### Fixes" },
        ),
      );
    }

    return parts.join("\n\n");
  }

  static createFresh(options: ComparisonReporterOptions): ComparisonReporter {
    return new ComparisonReporter(options);
  }
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function deltaPts(prev: number, curr: number): string {
  const d = (curr - prev) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
}

function deltaPct(prev: number, curr: number): string {
  if (prev === 0) return "—";
  const d = ((curr - prev) / prev) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
}
