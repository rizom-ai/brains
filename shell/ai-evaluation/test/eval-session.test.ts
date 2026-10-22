import { describe, expect, it } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defineConfig } from "@brains/app";
import type { AgentResponse, IAgentService } from "@brains/ai-service";
import { createMockAIService } from "@brains/ai-service/test";
import type { IRuntimeUploadsNamespace } from "@brains/plugins";
import { createTempDir } from "@brains/test-utils";

import { EvalHandlerRegistry } from "../src/eval-handler-registry";
import {
  runEvalSession,
  type EvalSessionDeps,
  type EvalSessionOptions,
  type EvalSessionShell,
} from "../src/eval-session";
import { RemoteAgentService } from "../src/remote-agent-service";
import type { RunEvaluationsOptions } from "../src/run-evaluation-types";
import type { IndexReadinessGate } from "../src/types";

/**
 * One booted eval brain's lifecycle, without booting anything. The boot and
 * the MCP connection are injected; everything else — the prebuilt-database
 * check, the job drains, the agent choice, the run options — is the real code
 * both runners share.
 */

function unused(name: string): never {
  throw new Error(`${name} should not be called`);
}

function agent(text: string): IAgentService {
  const response: AgentResponse = {
    text,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
  return {
    chat: async () => response,
    confirmPendingAction: async () => response,
    invalidateAgent: (): void => {},
  };
}

interface Harness {
  events: string[];
  bootCalls: unknown[];
  shell: EvalSessionShell;
  shellAgent: IAgentService;
  shellAi: ReturnType<typeof createMockAIService>;
  mcpAgent: IAgentService & { close(): Promise<void> };
  runtimeUploads: IRuntimeUploadsNamespace;
  indexReadiness: IndexReadinessGate;
  deps: EvalSessionDeps;
}

function harness(): Harness {
  const events: string[] = [];
  const bootCalls: unknown[] = [];
  const shellAgent = agent("shell");
  const shellAi = createMockAIService();
  const runtimeUploads: IRuntimeUploadsNamespace = {
    scoped: () => unused("runtimeUploads.scoped"),
  };
  const indexReadiness: IndexReadinessGate = {
    awaitIndexReady: () => unused("awaitIndexReady"),
  };
  const mcpAgent = {
    ...agent("mcp"),
    close: async (): Promise<void> => {
      events.push("mcp-close");
    },
  };
  const shell: EvalSessionShell = {
    getJobQueueService: () => ({
      getActiveJobs: async (): Promise<Array<{ type: string }>> => {
        events.push("drain");
        return [];
      },
    }),
    getMCPService: () => unused("getMCPService"),
    getAgentService: () => shellAgent,
    getRuntimeUploadRegistry: () => runtimeUploads,
    getEntityService: () => indexReadiness,
    getAIService: () => shellAi,
    shutdown: async (): Promise<void> => {
      events.push("shutdown");
    },
  };
  const deps: EvalSessionDeps = {
    bootEvalApp: async (options) => {
      bootCalls.push(options);
      events.push("boot");
      // Booting creates the entity database, as the real boot does: a
      // prebuilt check made after boot would always see one.
      await writeFile(`${options.evalDbBase}.db`, "");
      return { getShell: () => shell };
    },
    connectMcpAgent: async () => {
      events.push("mcp-connect");
      return mcpAgent;
    },
  };
  return {
    events,
    bootCalls,
    shell,
    shellAgent,
    shellAi,
    mcpAgent,
    runtimeUploads,
    indexReadiness,
    deps,
  };
}

const config = defineConfig({ name: "eval-brain" });
const evalHandlerRegistry = EvalHandlerRegistry.createFresh();

async function sessionOptions(
  overrides: Partial<EvalSessionOptions> = {},
): Promise<EvalSessionOptions> {
  const dir = await createTempDir("eval-session-");
  return {
    evalDbBase: join(dir, "brain-eval"),
    config,
    evalHandlerRegistry,
    testCasesDirs: ["/evals/a", "/evals/b"],
    skipLLMJudge: false,
    verbose: true,
    parallel: true,
    maxParallel: 4,
    mcpBasic: false,
    ...overrides,
  };
}

function recordRun(
  events: string[],
  seen: RunEvaluationsOptions[],
): (runOptions: RunEvaluationsOptions) => Promise<string> {
  return async (runOptions) => {
    events.push("run");
    seen.push(runOptions);
    return "result";
  };
}

describe("runEvalSession", () => {
  it("boots, settles ingestion, runs against the local brain, settles, and shuts down", async () => {
    const h = harness();
    const seen: RunEvaluationsOptions[] = [];
    const options = await sessionOptions({
      tags: ["core"],
      testCaseIds: ["case-1"],
      testType: "agent",
    });

    const result = await runEvalSession(
      options,
      recordRun(h.events, seen),
      h.deps,
    );

    expect(result).toBe("result");
    expect(h.events).toEqual(["boot", "drain", "run", "drain", "shutdown"]);
    expect(h.bootCalls).toStrictEqual([
      { evalDbBase: options.evalDbBase, config, evalHandlerRegistry },
    ]);
    expect(seen).toHaveLength(1);
    const [runOptions] = seen;
    expect(Object.keys(runOptions ?? {})).toEqual([
      "agentService",
      "aiService",
      "runtimeUploads",
      "testCasesDir",
      "skipLLMJudge",
      "verbose",
      "parallel",
      "maxParallel",
      "indexReadiness",
      "tags",
      "testCaseIds",
      "testType",
    ]);
    expect(runOptions?.agentService).toBe(h.shellAgent);
    expect(runOptions?.aiService).toBe(h.shellAi);
    expect(runOptions?.runtimeUploads).toBe(h.runtimeUploads);
    expect(runOptions?.indexReadiness).toBe(h.indexReadiness);
    expect(runOptions).toMatchObject({
      testCasesDir: ["/evals/a", "/evals/b"],
      skipLLMJudge: false,
      verbose: true,
      parallel: true,
      maxParallel: 4,
      tags: ["core"],
      testCaseIds: ["case-1"],
      testType: "agent",
    });
  });

  it("skips the ingestion drain when the environment has a prebuilt database", async () => {
    const h = harness();
    const options = await sessionOptions();
    await writeFile(`${options.evalDbBase}.db`, "prebuilt");

    await runEvalSession(options, recordRun(h.events, []), h.deps);

    expect(h.events).toEqual(["boot", "run", "drain", "shutdown"]);
  });

  it("passes the model to boot and uses the given AI service over the shell's", async () => {
    const h = harness();
    const seen: RunEvaluationsOptions[] = [];
    const judge = createMockAIService();
    const options = await sessionOptions({ model: "gpt-x", aiService: judge });

    await runEvalSession(options, recordRun(h.events, seen), h.deps);

    expect(h.bootCalls).toStrictEqual([
      {
        evalDbBase: options.evalDbBase,
        config,
        evalHandlerRegistry,
        model: "gpt-x",
      },
    ]);
    expect(seen[0]?.aiService).toBe(judge);
  });

  it("runs against a remote brain without local settling, uploads or readiness", async () => {
    const h = harness();
    const seen: RunEvaluationsOptions[] = [];
    const options = await sessionOptions({
      remoteUrl: "https://brain.example",
      authToken: "token",
    });

    await runEvalSession(options, recordRun(h.events, seen), h.deps);

    expect(h.events).toEqual(["boot", "run", "shutdown"]);
    const [runOptions] = seen;
    expect(runOptions?.agentService).toBeInstanceOf(RemoteAgentService);
    expect(Object.keys(runOptions ?? {})).toEqual([
      "agentService",
      "aiService",
      "testCasesDir",
      "skipLLMJudge",
      "verbose",
      "parallel",
      "maxParallel",
    ]);
  });

  it("evaluates through the basic MCP agent and closes it before shutdown", async () => {
    const h = harness();
    const seen: RunEvaluationsOptions[] = [];
    const options = await sessionOptions({ mcpBasic: true });

    await runEvalSession(options, recordRun(h.events, seen), h.deps);

    expect(seen[0]?.agentService).toBe(h.mcpAgent);
    expect(h.events).toEqual([
      "boot",
      "drain",
      "mcp-connect",
      "run",
      "drain",
      "mcp-close",
      "shutdown",
    ]);
  });

  it("closes the MCP agent and shuts down when the run throws", async () => {
    const h = harness();
    const options = await sessionOptions({ mcpBasic: true });
    const failure = new Error("run failed");

    const rejected = await runEvalSession(
      options,
      async () => {
        h.events.push("run");
        throw failure;
      },
      h.deps,
    ).catch((error: unknown) => error);

    expect(rejected).toBe(failure);
    expect(h.events).toEqual([
      "boot",
      "drain",
      "mcp-connect",
      "run",
      "mcp-close",
      "shutdown",
    ]);
  });
});
