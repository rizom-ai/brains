import type { IAgentService, IAIService } from "@brains/ai-service";

export interface RunEvaluationsOptions {
  /** Agent service (from shell or remote) */
  agentService: IAgentService;
  /** AI service for LLM judge */
  aiService: IAIService;
  /** Directory containing test cases */
  testCasesDir?: string | string[];
  /** Directory to save results */
  resultsDir?: string;
  /** Skip LLM-as-judge scoring */
  skipLLMJudge?: boolean;
  /** Compare against previous run or named baseline */
  compareAgainst?: string;
  /** Save results as a named baseline */
  saveBaseline?: string;
  /** Filter by tags */
  tags?: string[];
  /** Specific test case IDs to run */
  testCaseIds?: string[];
  /** Filter by test type: "agent" or "plugin" */
  testType?: "agent" | "plugin";
  /** Show verbose output */
  verbose?: boolean;
  /** Run tests in parallel */
  parallel?: boolean;
  /** Maximum parallel tests (default: 3) */
  maxParallel?: number;
}
