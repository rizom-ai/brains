import { resolve as resolvePath } from "path";
import type { AppConfig } from "@brains/app";
import { AIService, type IAIService } from "@brains/ai-service";
import { Logger } from "@brains/utils/logger";
import { getErrorMessage } from "@brains/utils/error";

import type { EvaluationSummary } from "./schemas";
import type { EvalHandlerRegistry } from "./eval-handler-registry";
import type { RunEvaluationsOptions } from "./run-evaluation-types";
import { RemoteAgentService } from "./remote-agent-service";
import { resolveProviderKey } from "./multi-model";
import { bootEvalApp, prepareEvalEnvironment } from "./eval-environment";
import { hasPrebuiltEvalDatabase, waitForJobsToDrain } from "./eval-settle";
import {
  renderModelComparison,
  writeModelComparisonReport,
} from "./reporters/model-comparison-reporter";

export interface MultiModelRunOptions {
  models: string[];
  judge?: string | undefined;
  config: AppConfig;
  testCasesDirs: string[];
  brainModelPath?: string | undefined;
  evalHandlerRegistry: EvalHandlerRegistry;
  cloneData: boolean;
  skipLLMJudge: boolean;
  verbose: boolean;
  parallel: boolean;
  maxParallel: number;
  tags?: string[] | undefined;
  testCaseIds?: string[] | undefined;
  testType?: "agent" | "plugin" | undefined;
  remoteUrl?: string | undefined;
  authToken?: string | undefined;
  resolveConfig?: (() => AppConfig) | undefined;
  runEvaluationsCollect: (
    options: RunEvaluationsOptions,
  ) => Promise<EvaluationSummary>;
}

/** What one model's run produced: a summary, or the reason it never got one. */
export interface ModelRunOutcome {
  model: string;
  summary?: EvaluationSummary;
  error?: string;
}

/**
 * Run every model, in order, and keep going when one fails.
 *
 * A model can fail before it produces any summary at all — a missing provider
 * key, a boot failure. Letting that propagate discarded every model already
 * evaluated and skipped the comparison report entirely, so a five-model run
 * that stumbled on the third returned nothing for the two that had passed.
 *
 * The run function is a parameter so this is testable without booting a brain.
 */
export async function collectModelRuns(
  models: readonly string[],
  runModel: (model: string) => Promise<EvaluationSummary>,
): Promise<ModelRunOutcome[]> {
  const outcomes: ModelRunOutcome[] = [];

  for (const model of models) {
    try {
      outcomes.push({ model, summary: await runModel(model) });
    } catch (error) {
      const message = getErrorMessage(error, "model run failed");
      console.error(`\n✖ Model ${model} did not complete: ${message}`);
      outcomes.push({ model, error: message });
    }
  }

  return outcomes;
}

/** The runs the comparison report can actually describe. */
export function succeededRuns(
  outcomes: readonly ModelRunOutcome[],
): Array<{ model: string; summary: EvaluationSummary }> {
  return outcomes.flatMap((outcome) =>
    outcome.summary ? [{ model: outcome.model, summary: outcome.summary }] : [],
  );
}

/**
 * The exit code a whole comparison should produce.
 *
 * A model that could not run counts as a failure. It contributes no failing
 * tests precisely because it never ran one, so ignoring it would let a broken
 * model read as success.
 */
export function exitCodeForModelRuns(
  outcomes: readonly ModelRunOutcome[],
): number {
  if (outcomes.length === 0) return 1;
  if (outcomes.some((outcome) => outcome.error !== undefined)) return 1;
  return outcomes.some((outcome) => (outcome.summary?.failedTests ?? 0) > 0)
    ? 1
    : 0;
}

export async function runMultiModelEvaluation(
  options: MultiModelRunOptions,
): Promise<void> {
  const judgeAiService = createJudgeAiService(options.judge);

  console.log(
    `\n🔄 Multi-model evaluation: ${options.models.join(", ")}\n${"─".repeat(60)}`,
  );

  const outcomes = await collectModelRuns(options.models, (model) =>
    runSingleModelIteration(model, options, judgeAiService).then(
      (result) => result.summary,
    ),
  );

  const completed = succeededRuns(outcomes);
  if (completed.length > 0) {
    const resultsDir = resolvePath(process.cwd(), "eval-results");
    await writeModelComparisonReport(completed, resultsDir);
    process.stdout.write(`\n${renderModelComparison(completed)}`);
  }

  const failedToRun = outcomes.filter((outcome) => outcome.error !== undefined);
  if (failedToRun.length > 0) {
    process.stdout.write(
      `\n${failedToRun.length} of ${outcomes.length} models did not complete: ${failedToRun
        .map((outcome) => outcome.model)
        .join(", ")}\n`,
    );
  }

  process.exit(exitCodeForModelRuns(outcomes));
}

function createJudgeAiService(judge: string | undefined): IAIService {
  // LLM judge — uses explicit judge model from YAML, or defaults to anthropic.
  const judgeModel = judge ?? "claude-haiku-4-5";
  const judgeKey = resolveProviderKey(judgeModel, process.env);
  return AIService.createFresh(
    {
      ...(judgeKey ? { apiKey: judgeKey } : {}),
      model: judgeModel,
    },
    Logger.getInstance(),
  );
}

async function runSingleModelIteration(
  model: string,
  options: MultiModelRunOptions,
  judgeAiService: IAIService,
): Promise<{ model: string; summary: EvaluationSummary }> {
  console.log(`\n▶ Model: ${model}\n${"─".repeat(40)}`);

  const providerKey = resolveProviderKey(model, process.env);
  if (providerKey) {
    process.env["AI_API_KEY"] = providerKey;
  }

  const evalDbBase = prepareEvalEnvironment({
    brainModelPath: options.brainModelPath,
    config: options.config,
    cloneData: options.cloneData,
    suffix: model.replace(/[^a-z0-9-]/gi, "-"),
  });

  const modelConfig = options.resolveConfig
    ? options.resolveConfig()
    : options.config;
  const hasPrebuiltDatabase = hasPrebuiltEvalDatabase(evalDbBase);
  const app = await bootEvalApp({
    evalDbBase,
    config: modelConfig,
    evalHandlerRegistry: options.evalHandlerRegistry,
    model,
  });

  const shell = app.getShell();
  if (!hasPrebuiltDatabase && !options.remoteUrl) {
    // Without a prebuilt database the boot's initial sync is still ingesting
    // seed content; settle the brain instead of racing the ingestion jobs.
    await waitForJobsToDrain(shell.getJobQueueService());
  }
  const agentService = options.remoteUrl
    ? RemoteAgentService.createFresh({
        baseUrl: options.remoteUrl,
        authToken: options.authToken,
      })
    : shell.getAgentService();

  const summary = await options.runEvaluationsCollect({
    agentService,
    aiService: judgeAiService,
    ...(!options.remoteUrl
      ? { runtimeUploads: shell.getRuntimeUploadRegistry() }
      : {}),
    testCasesDir: options.testCasesDirs,
    skipLLMJudge: options.skipLLMJudge,
    verbose: options.verbose,
    parallel: options.parallel,
    maxParallel: options.maxParallel,
    ...(!options.remoteUrl && { indexReadiness: shell.getEntityService() }),
    ...(options.tags && { tags: options.tags }),
    ...(options.testCaseIds && { testCaseIds: options.testCaseIds }),
    ...(options.testType && { testType: options.testType }),
  });

  // Stop background services and close DB connections.
  // The next bootEvalApp() → Shell.createFresh() handles resetting singleton references automatically.
  await shell.shutdown();

  return { model, summary };
}
