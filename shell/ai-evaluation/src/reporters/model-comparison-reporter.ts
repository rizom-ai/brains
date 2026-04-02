import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import type { EvaluationSummary } from "../schemas";

export interface ModelResult {
  model: string;
  summary: EvaluationSummary;
}

/**
 * Render a multi-model comparison as markdown.
 */
export function renderModelComparison(results: ModelResult[]): string {
  const lines: string[] = [];

  lines.push("# Model Comparison");
  lines.push("");
  lines.push(
    `_${results.length} models evaluated at ${new Date().toISOString()}_`,
  );
  lines.push("");

  // ── Summary table ──────────────────────────────────────────────────
  lines.push("## Summary");
  lines.push("");
  lines.push(
    "| Model | Pass | Fail | Total | Rate | Avg Tokens | Avg Duration |",
  );
  lines.push(
    "|-------|------|------|-------|------|------------|-------------|",
  );

  for (const { model, summary } of results) {
    const rate =
      summary.totalTests > 0
        ? `${Math.round((summary.passedTests / summary.totalTests) * 100)}%`
        : "N/A";
    const tokens = Math.round(summary.avgMetrics.totalTokens);
    const duration = `${(summary.avgMetrics.durationMs / 1000).toFixed(1)}s`;

    lines.push(
      `| ${model} | ${summary.passedTests} | ${summary.failedTests} | ${summary.totalTests} | ${rate} | ${tokens} | ${duration} |`,
    );
  }

  lines.push("");

  // ── Per-test matrix ────────────────────────────────────────────────
  const allTestIds = new Set<string>();
  for (const { summary } of results) {
    for (const result of summary.results) {
      allTestIds.add(result.testCaseId);
    }
  }

  if (allTestIds.size > 0) {
    const sortedTestIds = [...allTestIds].sort();
    const modelNames = results.map((r) => r.model);

    lines.push("## Per-Test Results");
    lines.push("");
    lines.push(`| Test | ${modelNames.join(" | ")} |`);
    lines.push(`|------|${modelNames.map(() => "------").join("|")}|`);

    for (const testId of sortedTestIds) {
      const cells = results.map(({ summary }) => {
        const result = summary.results.find((r) => r.testCaseId === testId);
        if (!result) return "—";
        return result.passed ? "✅" : "❌";
      });
      lines.push(`| ${testId} | ${cells.join(" | ")} |`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Write model comparison report to eval-results/.
 */
export async function writeModelComparisonReport(
  results: ModelResult[],
  outputDirectory: string,
): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });

  // Markdown report
  const md = renderModelComparison(results);
  await writeFile(join(outputDirectory, "model-comparison.md"), md, "utf-8");

  // JSON report
  const json = results.map(({ model, summary }) => ({
    model,
    passed: summary.passedTests,
    failed: summary.failedTests,
    total: summary.totalTests,
    passRate: `${Math.round((summary.passedTests / summary.totalTests) * 100)}%`,
    avgTokens: Math.round(summary.avgMetrics.totalTokens),
    avgDurationMs: Math.round(summary.avgMetrics.durationMs),
    perTest: Object.fromEntries(
      summary.results.map((r) => [r.testCaseId, r.passed ? "pass" : "fail"]),
    ),
  }));
  await writeFile(
    join(outputDirectory, "model-comparison.json"),
    JSON.stringify(json, null, 2),
    "utf-8",
  );
}
