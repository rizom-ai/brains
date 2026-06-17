import { execSync } from "child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "fs";
import { resolve as resolvePath } from "path";
import { type AppConfig, App } from "@brains/app";

import type { EvalHandlerRegistry } from "./eval-handler-registry";

export interface PrepareEvalEnvironmentOptions {
  brainModelPath?: string | undefined;
  config?: AppConfig | undefined;
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
  const { brainModelPath, config, cloneData = false, suffix } = options;
  const evalDbBase = `/tmp/brain-eval-${Date.now()}${suffix ? `-${suffix}` : ""}`;

  if (cloneData) {
    cloneEvaluationData(evalDbBase);
  }

  copyEvaluationContent(evalDbBase, brainModelPath, config);
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
      embeddingDatabase: { url: `file:${evalDbBase}-embeddings.db` },
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

  if (existsSync(`${sourceDataDir}/embeddings.db`)) {
    copyFileSync(
      `${sourceDataDir}/embeddings.db`,
      `${evalDbBase}-embeddings.db`,
    );
  }

  if (existsSync(sourceBrainData)) {
    mkdirSync(`${evalDbBase}-data`, { recursive: true });
    cpSync(sourceBrainData, `${evalDbBase}-data`, { recursive: true });
  }
}

function copyEvaluationContent(
  evalDbBase: string,
  brainModelPath: string | undefined,
  config: AppConfig | undefined,
): void {
  const evalDataDir = `${evalDbBase}-data`;
  const contentDir = findEvaluationContentDirectory(
    brainModelPath,
    getConfiguredSeedContentPath(config),
  );
  if (!contentDir) return;

  mkdirSync(evalDataDir, { recursive: true });
  cpSync(contentDir, evalDataDir, { recursive: true });

  const evalDb = resolvePath(contentDir, "brain.db");
  if (existsSync(evalDb)) {
    copyFileSync(evalDb, `${evalDbBase}.db`);
  }

  const evalEmbeddingDb = resolvePath(contentDir, "embeddings.db");
  if (existsSync(evalEmbeddingDb)) {
    copyFileSync(evalEmbeddingDb, `${evalDbBase}-embeddings.db`);
  }
}

function findEvaluationContentDirectory(
  brainModelPath: string | undefined,
  configuredSeedContentPath: string | undefined,
): string | undefined {
  const configuredDirs = configuredSeedContentPath
    ? [
        resolvePath(process.cwd(), configuredSeedContentPath),
        ...(brainModelPath
          ? [resolvePath(brainModelPath, configuredSeedContentPath)]
          : []),
      ]
    : [];
  const candidateDirs = [
    ...configuredDirs,
    resolvePath(process.cwd(), "eval-content"),
    ...(brainModelPath ? [resolvePath(brainModelPath, "eval-content")] : []),
    resolvePath(process.cwd(), "seed-content"),
  ];

  return candidateDirs.find((directory) => existsSync(directory));
}

function getConfiguredSeedContentPath(
  config: AppConfig | undefined,
): string | undefined {
  const directorySync = config?.plugins?.find(
    (plugin) => plugin.id === "directory-sync",
  ) as { config?: { seedContentPath?: unknown } } | undefined;
  const seedContentPath = directorySync?.config?.seedContentPath;
  return typeof seedContentPath === "string" ? seedContentPath : undefined;
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
