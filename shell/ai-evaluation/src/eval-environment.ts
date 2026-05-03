import { execSync } from "child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "fs";
import { resolve as resolvePath } from "path";
import { type AppConfig, App } from "@brains/app";

import type { EvalHandlerRegistry } from "./eval-handler-registry";

export interface PrepareEvalEnvironmentOptions {
  brainModelPath?: string | undefined;
  cloneData?: boolean;
  suffix?: string;
}

export interface BootEvalAppOptions {
  evalDbBase: string;
  config: AppConfig;
  evalHandlerRegistry: EvalHandlerRegistry;
  model?: string;
}

/**
 * Prepare temp dirs, clone data, copy eval content, create git repo.
 * Returns the evalDbBase path prefix.
 */
export function prepareEvalEnvironment(
  options: PrepareEvalEnvironmentOptions = {},
): string {
  const { brainModelPath, cloneData = false, suffix } = options;
  const evalDbBase = `/tmp/brain-eval-${Date.now()}${suffix ? `-${suffix}` : ""}`;

  if (cloneData) {
    cloneEvaluationData(evalDbBase);
  }

  copyEvaluationContent(evalDbBase, brainModelPath);
  createEvalGitRemote(evalDbBase);

  return evalDbBase;
}

/**
 * Boot an App with optional AI model override.
 * API key comes from process.env.AI_API_KEY (set per model iteration).
 */
export async function bootEvalApp(options: BootEvalAppOptions): Promise<App> {
  const { evalDbBase, config, evalHandlerRegistry, model } = options;
  const evalConfig = {
    ...config,
    database: undefined,
    ...(model ? { aiModel: model } : {}),
    shellConfig: {
      ...config.shellConfig,
      database: { url: `file:${evalDbBase}.db` },
      jobQueueDatabase: { url: `file:${evalDbBase}-jobs.db` },
      conversationDatabase: { url: `file:${evalDbBase}-conv.db` },
      embedding: { cacheDir: `${evalDbBase}-cache` },
      evalHandlerRegistry,
      dataDir: `${evalDbBase}-data`,
    },
  };
  const app = App.create(evalConfig);
  await app.initialize();
  return app;
}

function cloneEvaluationData(evalDbBase: string): void {
  const sourceDataDir = resolvePath(process.cwd(), "data");
  const sourceBrainData = resolvePath(process.cwd(), "brain-data");

  if (existsSync(`${sourceDataDir}/brain.db`)) {
    copyFileSync(`${sourceDataDir}/brain.db`, `${evalDbBase}.db`);
  }

  if (existsSync(sourceBrainData)) {
    mkdirSync(`${evalDbBase}-data`, { recursive: true });
    cpSync(sourceBrainData, `${evalDbBase}-data`, { recursive: true });
  }
}

function copyEvaluationContent(
  evalDbBase: string,
  brainModelPath: string | undefined,
): void {
  const evalDataDir = `${evalDbBase}-data`;
  const contentDir = findEvaluationContentDirectory(brainModelPath);
  if (!contentDir) return;

  mkdirSync(evalDataDir, { recursive: true });
  cpSync(contentDir, evalDataDir, { recursive: true });

  const evalDb = resolvePath(contentDir, "brain.db");
  if (existsSync(evalDb)) {
    copyFileSync(evalDb, `${evalDbBase}.db`);
  }
}

function findEvaluationContentDirectory(
  brainModelPath: string | undefined,
): string | undefined {
  const candidateDirs = [
    resolvePath(process.cwd(), "eval-content"),
    ...(brainModelPath ? [resolvePath(brainModelPath, "eval-content")] : []),
    resolvePath(process.cwd(), "seed-content"),
  ];

  return candidateDirs.find((directory) => existsSync(directory));
}

function createEvalGitRemote(evalDbBase: string): void {
  const gitRemotePath = `${evalDbBase}-git-remote`;
  if (existsSync(gitRemotePath)) {
    rmSync(gitRemotePath, { recursive: true, force: true });
  }

  mkdirSync(gitRemotePath, { recursive: true });
  execSync("git init --bare", { cwd: gitRemotePath, stdio: "ignore" });

  // Set env so brain.eval.yaml can interpolate ${EVAL_GIT_REMOTE}
  process.env["EVAL_GIT_REMOTE"] = gitRemotePath;
}
