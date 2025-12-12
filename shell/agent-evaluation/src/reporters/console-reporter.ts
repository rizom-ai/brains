import chalk from "chalk";

import type { IReporter } from "../types";
import type { EvaluationSummary, EvaluationResult } from "../schemas";

/**
 * Options for the console reporter
 */
export interface ConsoleReporterOptions {
  /** Show detailed results for each test */
  verbose?: boolean;
  /** Show failure details */
  showFailures?: boolean;
}

/**
 * Reports evaluation results to the console
 */
export class ConsoleReporter implements IReporter {
  private options: ConsoleReporterOptions;

  constructor(options: ConsoleReporterOptions = {}) {
    this.options = {
      verbose: false,
      showFailures: true,
      ...options,
    };
  }

  /**
   * Report evaluation results
   */
  async report(summary: EvaluationSummary): Promise<void> {
    console.log("");
    console.log(chalk.bold("Agent Evaluation Results"));
    console.log("=".repeat(50));
    console.log("");

    // Individual results
    for (const result of summary.results) {
      this.reportResult(result);
    }

    // Summary
    console.log("");
    console.log(chalk.bold("Summary"));
    console.log("-".repeat(50));

    const passColor =
      summary.passedTests === summary.totalTests ? chalk.green : chalk.yellow;
    console.log(
      `Tests: ${passColor(`${summary.passedTests} passed`)}, ${chalk.red(`${summary.failedTests} failed`)}, ${summary.totalTests} total`,
    );
    console.log(`Pass Rate: ${(summary.passRate * 100).toFixed(1)}%`);
    console.log("");

    // Average metrics
    console.log(chalk.bold("Average Metrics"));
    console.log(`  Tokens: ${summary.avgMetrics.totalTokens.toFixed(0)}`);
    console.log(`  Tool Calls: ${summary.avgMetrics.toolCallCount.toFixed(1)}`);
    console.log(`  Duration: ${summary.avgMetrics.durationMs.toFixed(0)}ms`);

    // Quality scores
    if (summary.avgQualityScores) {
      console.log("");
      console.log(chalk.bold("Average Quality Scores"));
      console.log(
        `  Helpfulness: ${this.formatScore(summary.avgQualityScores.helpfulness)}`,
      );
      console.log(
        `  Accuracy: ${this.formatScore(summary.avgQualityScores.accuracy)}`,
      );
      console.log(
        `  Instruction Following: ${this.formatScore(summary.avgQualityScores.instructionFollowing)}`,
      );
      if (summary.avgQualityScores.appropriateToolUse !== undefined) {
        console.log(
          `  Tool Use: ${this.formatScore(summary.avgQualityScores.appropriateToolUse)}`,
        );
      }
    }

    console.log("");
  }

  /**
   * Report a single result
   */
  private reportResult(result: EvaluationResult): void {
    const status = result.passed ? chalk.green("PASS") : chalk.red("FAIL");

    console.log(`${status} ${result.testCaseName} (${result.testCaseId})`);

    if (this.options.verbose) {
      console.log(chalk.dim(`  Turns: ${result.turnResults.length}`));
      console.log(chalk.dim(`  Tokens: ${result.totalMetrics.totalTokens}`));
      console.log(
        chalk.dim(`  Tool Calls: ${result.totalMetrics.toolCallCount}`),
      );
      console.log(chalk.dim(`  Duration: ${result.totalMetrics.durationMs}ms`));

      if (result.qualityScores) {
        console.log(
          chalk.dim(
            `  Quality: H=${result.qualityScores.helpfulness.toFixed(1)} A=${result.qualityScores.accuracy.toFixed(1)} I=${result.qualityScores.instructionFollowing.toFixed(1)}`,
          ),
        );
      }
    }

    // Show failures
    if (this.options.showFailures && !result.passed) {
      for (const failure of result.failures) {
        console.log(
          `  ${chalk.red("x")} ${failure.message ?? failure.criterion}`,
        );
        if (this.options.verbose) {
          console.log(
            chalk.dim(`    Expected: ${JSON.stringify(failure.expected)}`),
          );
          console.log(
            chalk.dim(`    Actual: ${JSON.stringify(failure.actual)}`),
          );
        }
      }

      if (result.efficiencyFailures) {
        for (const failure of result.efficiencyFailures) {
          console.log(
            `  ${chalk.yellow("!")} ${failure.message ?? failure.criterion}`,
          );
        }
      }
    }
  }

  /**
   * Format a quality score with color
   */
  private formatScore(score: number): string {
    const formatted = `${score.toFixed(1)}/5`;
    if (score >= 4) return chalk.green(formatted);
    if (score >= 3) return chalk.yellow(formatted);
    return chalk.red(formatted);
  }

  /**
   * Create a fresh reporter instance
   */
  static createFresh(options?: ConsoleReporterOptions): ConsoleReporter {
    return new ConsoleReporter(options);
  }
}
