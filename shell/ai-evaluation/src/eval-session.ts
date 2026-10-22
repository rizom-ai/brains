import type { AppConfig } from "@brains/app";
import type { IAgentService, IAIService } from "@brains/ai-service";
import type { IMCPTransport } from "@brains/mcp-service";
import type { IRuntimeUploadsNamespace } from "@brains/plugins";

import type { EvalHandlerRegistry } from "./eval-handler-registry";
import type { RunEvaluationsOptions } from "./run-evaluation-types";
import type { IndexReadinessGate } from "./types";
import { RemoteAgentService } from "./remote-agent-service";
import { MCPProtocolAgentService } from "./mcp-protocol-agent-service";
import { bootEvalApp, type BootEvalAppOptions } from "./eval-environment";
import { hasPrebuiltEvalDatabase, waitForJobsToDrain } from "./eval-settle";

/** The parts of the booted Shell one eval session uses. */
export interface EvalSessionShell {
  getJobQueueService(): {
    getActiveJobs(): Promise<Array<{ type: string }>>;
  };
  getMCPService(): IMCPTransport;
  getAgentService(): IAgentService;
  getRuntimeUploadRegistry(): IRuntimeUploadsNamespace;
  getEntityService(): IndexReadinessGate;
  getAIService(): IAIService;
  shutdown(): Promise<void>;
}

export interface EvalSessionDeps {
  bootEvalApp: (
    options: BootEvalAppOptions,
  ) => Promise<{ getShell(): EvalSessionShell }>;
  connectMcpAgent: (
    shell: EvalSessionShell,
  ) => Promise<IAgentService & { close(): Promise<void> }>;
}

const defaultDeps: EvalSessionDeps = {
  bootEvalApp,
  connectMcpAgent: (shell) =>
    MCPProtocolAgentService.connect(shell.getMCPService()),
};

export interface EvalSessionOptions {
  /** Prepared environment path prefix, from prepareEvalEnvironment. */
  evalDbBase: string;
  config: AppConfig;
  evalHandlerRegistry: EvalHandlerRegistry;
  model?: string | undefined;
  /** AI service for the LLM judge; defaults to the booted brain's own. */
  aiService?: IAIService | undefined;
  testCasesDirs: string[];
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
}

/**
 * Boot one eval brain, run the suite against it, and shut it down.
 *
 * Both the single- and the multi-model runner go through this, once per run.
 */
export async function runEvalSession<T>(
  options: EvalSessionOptions,
  run: (runOptions: RunEvaluationsOptions) => Promise<T>,
  deps: EvalSessionDeps = defaultDeps,
): Promise<T> {
  // Must be checked before boot, which creates the database file itself.
  const hasPrebuiltDatabase = hasPrebuiltEvalDatabase(options.evalDbBase);
  const app = await deps.bootEvalApp({
    evalDbBase: options.evalDbBase,
    config: options.config,
    evalHandlerRegistry: options.evalHandlerRegistry,
    ...(options.model !== undefined && { model: options.model }),
  });

  const shell = app.getShell();
  if (!hasPrebuiltDatabase && !options.remoteUrl) {
    // Without a prebuilt database the boot's initial sync is still ingesting
    // seed content; settle the brain instead of racing the ingestion jobs.
    await waitForJobsToDrain(shell.getJobQueueService());
  }
  let mcpAgentService: (IAgentService & { close(): Promise<void> }) | undefined;

  try {
    mcpAgentService = options.mcpBasic
      ? await deps.connectMcpAgent(shell)
      : undefined;
    const agentService = options.remoteUrl
      ? RemoteAgentService.createFresh({
          baseUrl: options.remoteUrl,
          authToken: options.authToken,
        })
      : (mcpAgentService ?? shell.getAgentService());

    const result = await run({
      agentService,
      aiService: options.aiService ?? shell.getAIService(),
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

    // Cases can enqueue projection and embedding work. Settle it before Shell
    // enters closing state so a final poll cannot start generation against an
    // already uninitialized runtime.
    if (!options.remoteUrl) {
      await waitForJobsToDrain(shell.getJobQueueService());
    }
    return result;
  } finally {
    await mcpAgentService?.close();
    // Stop background services and close DB connections. The next
    // bootEvalApp() → Shell.createFresh() resets singleton references.
    await shell.shutdown();
  }
}
