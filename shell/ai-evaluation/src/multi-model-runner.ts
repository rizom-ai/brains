import { resolve as resolvePath } from "path";
import type { AppConfig } from "@brains/app";
import { AIService, type IAIService } from "@brains/ai-service";
import { Logger } from "@brains/utils";

import type { EvaluationSummary } from "./schemas";
import type { EvalHandlerRegistry } from "./eval-handler-registry";
import type { RunEvaluationsOptions } from "./run-evaluation-types";
import { RemoteAgentService } from "./remote-agent-service";
import { resolveProviderKey } from "./multi-model";
import { bootEvalApp, prepareEvalEnvironment } from "./eval-environment";
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

export async function runMultiModelEvaluation(
  options: MultiModelRunOptions,
): Promise<void> {
  const judgeAiService = createJudgeAiService(options.judge);

  console.log(
    `\n🔄 Multi-model evaluation: ${options.models.join(", ")}\n${"─".repeat(60)}`,
  );

  const modelSummaries: Array<{ model: string; summary: EvaluationSummary }> =
    [];

  for (const model of options.models) {
    modelSummaries.push(
      await runSingleModelIteration(model, options, judgeAiService),
    );
  }

  const resultsDir = resolvePath(process.cwd(), "eval-results");
  await writeModelComparisonReport(modelSummaries, resultsDir);

  const md = renderModelComparison(modelSummaries);
  process.stdout.write(`\n${md}`);

  const anyFailed = modelSummaries.some(
    (modelSummary) => modelSummary.summary.failedTests > 0,
  );
  process.exit(anyFailed ? 1 : 0);
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
    cloneData: options.cloneData,
    suffix: model.replace(/[^a-z0-9-]/gi, "-"),
  });

  const modelConfig = options.resolveConfig
    ? options.resolveConfig()
    : options.config;
  const app = await bootEvalApp({
    evalDbBase,
    config: modelConfig,
    evalHandlerRegistry: options.evalHandlerRegistry,
    model,
  });

  const shell = app.getShell();
  const agentService = options.remoteUrl
    ? RemoteAgentService.createFresh({
        baseUrl: options.remoteUrl,
        authToken: options.authToken,
      })
    : shell.getAgentService();

  const summary = await options.runEvaluationsCollect({
    agentService,
    aiService: judgeAiService,
    testCasesDir: options.testCasesDirs,
    skipLLMJudge: options.skipLLMJudge,
    verbose: options.verbose,
    parallel: options.parallel,
    maxParallel: options.maxParallel,
    ...(options.tags && { tags: options.tags }),
    ...(options.testCaseIds && { testCaseIds: options.testCaseIds }),
    ...(options.testType && { testType: options.testType }),
  });

  // Stop background services and close DB connections.
  // The next bootEvalApp() → Shell.createFresh() handles resetting singleton references automatically.
  await shell.shutdown();

  return { model, summary };
}
