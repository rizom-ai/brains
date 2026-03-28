import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

import type { IReporter } from "../types";
import type { EvaluationSummary, EvaluationResult } from "../schemas";

export interface MarkdownReporterOptions {
  outputDirectory: string;
}

export class MarkdownReporter implements IReporter {
  constructor(private options: MarkdownReporterOptions) {}

  async report(summary: EvaluationSummary): Promise<void> {
    await mkdir(this.options.outputDirectory, { recursive: true });

    const md = this.render(summary);
    const filepath = join(this.options.outputDirectory, "latest.md");
    await writeFile(filepath, md, "utf-8");
    console.log(`Markdown report: ${filepath}`);
  }

  render(summary: EvaluationSummary): string {
    const lines: string[] = [];
    const date = summary.timestamp.split("T")[0];

    lines.push(`## Eval Run (${date})`);
    lines.push("");
    lines.push(
      `**${summary.totalTests} tests** — ${summary.passedTests} passed, ${summary.failedTests} failed (${(summary.passRate * 100).toFixed(1)}%)`,
    );
    lines.push("");

    // Category breakdown
    const categories = this.categorize(summary.results);
    if (categories.size > 0) {
      lines.push("| Category | Pass | Fail | Rate |");
      lines.push("|---|---|---|---|");
      for (const [category, results] of categories) {
        const pass = results.filter((r) => r.passed).length;
        const fail = results.length - pass;
        const rate =
          results.length > 0
            ? ((pass / results.length) * 100).toFixed(1)
            : "0.0";
        lines.push(`| ${category} | ${pass} | ${fail} | ${rate}% |`);
      }
      lines.push("");
    }

    // Failures
    const failures = summary.results.filter((r) => !r.passed);
    if (failures.length > 0) {
      lines.push("### Failures");
      lines.push("");
      for (const result of failures) {
        const reason =
          result.failures[0]?.message ??
          result.failures[0]?.criterion ??
          "unknown";
        lines.push(`- **${result.testCaseId}**: ${reason}`);
      }
      lines.push("");
    }

    // Metrics
    lines.push("### Metrics (avg)");
    lines.push("");
    lines.push(
      `Tokens: ${Math.round(summary.avgMetrics.totalTokens)} | Tool calls: ${summary.avgMetrics.toolCallCount.toFixed(1)} | Duration: ${(summary.avgMetrics.durationMs / 1000).toFixed(1)}s`,
    );
    lines.push("");

    // Quality scores
    if (summary.avgQualityScores) {
      const q = summary.avgQualityScores;
      lines.push("### Quality (avg)");
      lines.push("");
      const parts = [
        `Helpfulness: ${q.helpfulness.toFixed(1)}`,
        `Accuracy: ${q.accuracy.toFixed(1)}`,
        `Instructions: ${q.instructionFollowing.toFixed(1)}`,
      ];
      if (q.appropriateToolUse !== undefined) {
        parts.push(`Tool use: ${q.appropriateToolUse.toFixed(1)}`);
      }
      lines.push(parts.join(" | "));
      lines.push("");
    }

    return lines.join("\n");
  }

  private categorize(
    results: EvaluationResult[],
  ): Map<string, EvaluationResult[]> {
    const map = new Map<string, EvaluationResult[]>();
    for (const r of results) {
      // Derive category from test case ID prefix (e.g. "tool-invocation-list" → "tool-invocation")
      const parts = r.testCaseId.split("-");
      const category =
        parts.length >= 2 ? parts.slice(0, 2).join("-") : r.testCaseId;
      const list = map.get(category) ?? [];
      list.push(r);
      map.set(category, list);
    }
    return map;
  }

  static createFresh(options: MarkdownReporterOptions): MarkdownReporter {
    return new MarkdownReporter(options);
  }
}
