import type {
  TestCase,
  AgentTestCase,
  EvaluationResult,
  EvaluationSummary,
  QualityScores,
  TotalMetrics,
  TurnResult,
} from "./schemas";

/**
 * Handler function for plugin evaluations
 * Plugins register these to enable direct (non-chat) testing
 */
export type EvalHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
) => Promise<TOutput>;

/**
 * Registry for plugin eval handlers
 */
export interface IEvalHandlerRegistry {
  /**
   * Register an eval handler for a plugin
   */
  register(pluginId: string, handlerId: string, handler: EvalHandler): void;

  /**
   * Get an eval handler by plugin and handler ID
   */
  get(pluginId: string, handlerId: string): EvalHandler | undefined;

  /**
   * List all registered handlers
   */
  list(): Array<{ pluginId: string; handlerId: string }>;

  /**
   * Check if a handler exists
   */
  has(pluginId: string, handlerId: string): boolean;

  /**
   * Remove a handler
   */
  unregister(pluginId: string, handlerId: string): boolean;
}

/**
 * Options for running evaluations
 */
export interface EvaluationOptions {
  /** Specific test case IDs to run */
  testCaseIds?: string[];
  /** Tags to filter test cases */
  tags?: string[];
  /** Filter by test type: "agent" or "plugin" */
  testType?: "agent" | "plugin";
  /** Skip LLM-as-judge scoring for faster iteration */
  skipLLMJudge?: boolean;
  /** Sample rate for LLM judge (0-1, default 1.0) */
  llmJudgeSampleRate?: number;
  /** Run tests in parallel */
  parallel?: boolean;
  /** Maximum parallel tests */
  maxParallel?: number;
}

/**
 * Options for the test runner
 */
export interface TestRunnerOptions {
  /** Skip LLM-as-judge scoring */
  skipLLMJudge?: boolean;
  /** Timeout for each test case in ms */
  timeoutMs?: number;
}

/**
 * Options for the LLM judge
 */
export interface LLMJudgeOptions {
  /** Sample rate (0-1) for cost optimization */
  sampleRate?: number;
}

/**
 * Interface for the evaluation service
 */
export interface IEvaluationService {
  /**
   * Run evaluations against test cases
   */
  runEvaluations(options?: EvaluationOptions): Promise<EvaluationSummary>;

  /**
   * List available test cases
   */
  listTestCases(tags?: string[]): Promise<TestCase[]>;
}

/**
 * Interface for the test runner (agent-based evaluations)
 */
export interface ITestRunner {
  /**
   * Run a single agent test case
   */
  runTest(
    testCase: AgentTestCase,
    options?: TestRunnerOptions,
  ): Promise<EvaluationResult>;
}

/**
 * Interface for the LLM judge (agent-based evaluations only)
 */
export interface ILLMJudge {
  /**
   * Score a conversation for quality
   */
  scoreConversation(
    testCase: AgentTestCase,
    turnResults: TurnResult[],
  ): Promise<QualityScores | null>;
}

/**
 * Interface for the metric collector
 */
export interface IMetricCollector {
  /**
   * Start timing a turn
   */
  startTurn(): void;

  /**
   * End timing and record metrics from agent response
   */
  endTurn(response: {
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    toolResults?: Array<{
      toolName: string;
      args?: Record<string, unknown>;
      result?: unknown;
    }>;
  }): TurnResult["metrics"];

  /**
   * Get aggregated metrics across all turns
   */
  getTotalMetrics(): TotalMetrics;

  /**
   * Reset the collector for a new test
   */
  reset(): void;
}

/**
 * Interface for test case loaders
 */
export interface ITestCaseLoader {
  /**
   * Load test cases from a source
   */
  loadTestCases(): Promise<TestCase[]>;
}

/**
 * Interface for result reporters
 */
export interface IReporter {
  /**
   * Report evaluation results
   */
  report(summary: EvaluationSummary): Promise<void>;
}

// Re-export schema types
export type {
  TestCase,
  TestCaseType,
  AgentTestCase,
  AgentTestCaseType,
  PluginTestCase,
  ExpectedOutput,
  PathValidation,
  ItemsContain,
  PluginQualityCriteria,
  SuccessCriteria,
  ExpectedToolCall,
  Turn,
  TestSetup,
  Efficiency,
  EvaluationResult,
  EvaluationSummary,
  QualityScores,
  TotalMetrics,
  TurnResult,
  TurnMetrics,
  ToolCallRecord,
  FailureDetail,
} from "./schemas";
