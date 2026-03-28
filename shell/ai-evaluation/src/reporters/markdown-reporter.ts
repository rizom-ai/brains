import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { formatAsTable, formatAsList } from "@brains/utils";

import type { IReporter } from "../types";
import type { EvaluationSummary, EvaluationResult } from "../schemas";

export interface MarkdownReporterOptions {
  outputDirectory: string;
}

interface CategoryRow {
  category: string;
  pass: number;
  fail: number;
  rate: string;
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
    const parts: string[] = [];
    const date = summary.timestamp.split("T")[0];

    parts.push(
      `## Eval Run (${date})\n\n**${summary.totalTests} tests** — ${summary.passedTests} passed, ${summary.failedTests} failed (${(summary.passRate * 100).toFixed(1)}%)`,
    );

    // Category breakdown
    const categories = this.categorize(summary.results);
    if (categories.length > 0) {
      parts.push(
        formatAsTable(categories, {
          columns: [
            { header: "Category", value: (r): string => r.category },
            { header: "Pass", value: (r): number => r.pass, align: "right" },
            { header: "Fail", value: (r): number => r.fail, align: "right" },
            { header: "Rate", value: (r): string => r.rate, align: "right" },
          ],
        }),
      );
    }

    // Failures
    const failures = summary.results.filter((r) => !r.passed);
    if (failures.length > 0) {
      parts.push(
        formatAsList<string>(
          failures.map((r) => {
            const reason =
              r.failures[0]?.message ?? r.failures[0]?.criterion ?? "unknown";
            return `**${r.testCaseId}**: ${reason}`;
          }),
          { title: (s) => s, header: "### Failures" },
        ),
      );
    }

    // Metrics
    const m = summary.avgMetrics;
    parts.push(
      `### Metrics (avg)\n\nTokens: ${Math.round(m.totalTokens)} | Tool calls: ${m.toolCallCount.toFixed(1)} | Duration: ${(m.durationMs / 1000).toFixed(1)}s`,
    );

    // Quality scores
    if (summary.avgQualityScores) {
      const q = summary.avgQualityScores;
      const scores = [
        `Helpfulness: ${q.helpfulness.toFixed(1)}`,
        `Accuracy: ${q.accuracy.toFixed(1)}`,
        `Instructions: ${q.instructionFollowing.toFixed(1)}`,
      ];
      if (q.appropriateToolUse !== undefined) {
        scores.push(`Tool use: ${q.appropriateToolUse.toFixed(1)}`);
      }
      parts.push(`### Quality (avg)\n\n${scores.join(" | ")}`);
    }

    return parts.join("\n\n");
  }

  private categorize(results: EvaluationResult[]): CategoryRow[] {
    const map = new Map<string, EvaluationResult[]>();
    for (const r of results) {
      const parts = r.testCaseId.split("-");
      const category =
        parts.length >= 2 ? parts.slice(0, 2).join("-") : r.testCaseId;
      const list = map.get(category) ?? [];
      list.push(r);
      map.set(category, list);
    }

    return Array.from(map.entries()).map(([category, items]) => {
      const pass = items.filter((r) => r.passed).length;
      const fail = items.length - pass;
      const rate =
        items.length > 0
          ? `${((pass / items.length) * 100).toFixed(1)}%`
          : "0.0%";
      return { category, pass, fail, rate };
    });
  }

  static createFresh(options: MarkdownReporterOptions): MarkdownReporter {
    return new MarkdownReporter(options);
  }
}
