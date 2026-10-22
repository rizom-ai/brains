import type { AppConfig } from "@brains/app";

import type { EvalHandlerRegistry } from "./eval-handler-registry";
import type { RunEvaluationsOptions } from "./run-evaluation-types";
import { prepareEvalEnvironment } from "./eval-environment";
import { runEvalSession } from "./eval-session";

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
  mcpBasic: boolean;
  compareAgainst?: string | undefined;
  saveBaseline?: string | undefined;
  runEvaluations: (options: RunEvaluationsOptions) => Promise<void>;
}

export async function runSingleModelEvaluation(
  options: SingleModelRunOptions,
): Promise<void> {
  const evalDbBase = prepareEvalEnvironment({
    brainModelPath: options.brainModelPath,
    config: options.config,
    cloneData: options.cloneData,
  });
  if (options.cloneData) console.log("Cloned data for eval");

  await runEvalSession({ ...options, evalDbBase }, async (runOptions) => {
    if (options.remoteUrl) {
      console.log(`\nConnecting to remote brain: ${options.remoteUrl}`);
    } else if (options.mcpBasic) {
      console.log("\nEvaluating through basic MCP chat/confirm");
    }

    await options.runEvaluations({
      ...runOptions,
      ...(options.compareAgainst !== undefined && {
        compareAgainst: options.compareAgainst,
      }),
      ...(options.saveBaseline && { saveBaseline: options.saveBaseline }),
    });
  });
}
