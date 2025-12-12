import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

import type { IReporter } from "../types";
import type { EvaluationSummary } from "../schemas";

/**
 * Options for the JSON reporter
 */
export interface JSONReporterOptions {
  /** Directory to save results to */
  outputDirectory: string;
  /** Whether to include full results or just summary */
  includeFullResults?: boolean;
  /** Custom filename (defaults to timestamp-based) */
  filename?: string;
}

/**
 * Reports evaluation results to JSON files
 */
export class JSONReporter implements IReporter {
  private options: JSONReporterOptions;

  constructor(options: JSONReporterOptions) {
    this.options = {
      includeFullResults: true,
      ...options,
    };
  }

  /**
   * Report evaluation results
   */
  async report(summary: EvaluationSummary): Promise<void> {
    await mkdir(this.options.outputDirectory, { recursive: true });

    const filename =
      this.options.filename ??
      `evaluation-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const filepath = join(this.options.outputDirectory, filename);

    const output = this.options.includeFullResults
      ? summary
      : this.summarize(summary);

    await writeFile(filepath, JSON.stringify(output, null, 2), "utf-8");

    console.log(`Results saved to: ${filepath}`);
  }

  /**
   * Create a summary without full results
   */
  private summarize(summary: EvaluationSummary): object {
    return {
      timestamp: summary.timestamp,
      totalTests: summary.totalTests,
      passedTests: summary.passedTests,
      failedTests: summary.failedTests,
      passRate: summary.passRate,
      avgMetrics: summary.avgMetrics,
      avgQualityScores: summary.avgQualityScores,
      testResults: summary.results.map((r) => ({
        testCaseId: r.testCaseId,
        testCaseName: r.testCaseName,
        passed: r.passed,
        failureCount: r.failures.length,
      })),
    };
  }

  /**
   * Create a fresh reporter instance
   */
  static createFresh(options: JSONReporterOptions): JSONReporter {
    return new JSONReporter(options);
  }
}
