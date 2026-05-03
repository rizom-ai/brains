import type { AppConfig } from "@brains/app";

import type { EvalHandlerRegistry } from "./eval-handler-registry";
import type { RunEvaluationsOptions } from "./run-evaluation-types";
import { RemoteAgentService } from "./remote-agent-service";
import { bootEvalApp, prepareEvalEnvironment } from "./eval-environment";

export interface SingleModelRunOptions {
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
  compareAgainst?: string | undefined;
  saveBaseline?: string | undefined;
  runEvaluations: (options: RunEvaluationsOptions) => Promise<void>;
}

export async function runSingleModelEvaluation(
  options: SingleModelRunOptions,
): Promise<void> {
  const evalDbBase = prepareEvalEnvironment({
    brainModelPath: options.brainModelPath,
    cloneData: options.cloneData,
  });
  if (options.cloneData) console.log("Cloned data for eval");

  const app = await bootEvalApp({
    evalDbBase,
    config: options.config,
    evalHandlerRegistry: options.evalHandlerRegistry,
  });

  const shell = app.getShell();
  const aiService = shell.getAIService();
  const agentService = options.remoteUrl
    ? RemoteAgentService.createFresh({
        baseUrl: options.remoteUrl,
        authToken: options.authToken,
      })
    : shell.getAgentService();

  if (options.remoteUrl) {
    console.log(`\nConnecting to remote brain: ${options.remoteUrl}`);
  }

  await options.runEvaluations({
    agentService,
    aiService,
    testCasesDir: options.testCasesDirs,
    skipLLMJudge: options.skipLLMJudge,
    verbose: options.verbose,
    parallel: options.parallel,
    maxParallel: options.maxParallel,
    ...(options.tags && { tags: options.tags }),
    ...(options.testCaseIds && { testCaseIds: options.testCaseIds }),
    ...(options.testType && { testType: options.testType }),
    ...(options.compareAgainst !== undefined && {
      compareAgainst: options.compareAgainst,
    }),
    ...(options.saveBaseline && { saveBaseline: options.saveBaseline }),
  });
}
