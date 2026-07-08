import type { DbConfig } from "@brains/contracts";

export interface StandardPaths {
  dataDir: string;
  cacheDir: string;
  distDir: string;
}

export interface StandardConfig {
  database: DbConfig;
  jobQueueDatabase: DbConfig;
  conversationDatabase: DbConfig;
  runtimeStateDatabase: DbConfig;
  embeddingDatabase: DbConfig;
  embedding: {
    cacheDir: string;
  };
}

/**
 * Fixed relative defaults. Core never reads the environment — the
 * app/deploy layer resolves XDG paths and passes explicit config in
 * (see `resolveStandardPaths` in `@brains/app`).
 */
export function createStandardPaths(): StandardPaths {
  return {
    dataDir: "./data",
    cacheDir: "./cache",
    distDir: "./dist",
  };
}

export function createStandardConfig(paths: StandardPaths): StandardConfig {
  return {
    database: {
      url: `file:${paths.dataDir}/brain.db`,
    },
    jobQueueDatabase: {
      url: `file:${paths.dataDir}/brain-jobs.db`,
    },
    conversationDatabase: {
      url: `file:${paths.dataDir}/conversations.db`,
    },
    runtimeStateDatabase: {
      url: `file:${paths.dataDir}/runtime-state.db`,
    },
    embeddingDatabase: {
      url: `file:${paths.dataDir}/embeddings.db`,
    },
    embedding: {
      cacheDir: `${paths.cacheDir}/embeddings`,
    },
  };
}
