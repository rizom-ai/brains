import type { DbConfig } from "@brains/utils";

export interface StandardPaths {
  dataDir: string;
  cacheDir: string;
  distDir: string;
}

export interface StandardConfig {
  database: DbConfig;
  jobQueueDatabase: DbConfig;
  conversationDatabase: DbConfig;
  embeddingDatabase: DbConfig;
  embedding: {
    cacheDir: string;
  };
}

export function createStandardPaths(
  env: NodeJS.ProcessEnv = process.env,
): StandardPaths {
  return {
    dataDir: env["XDG_DATA_HOME"] ?? "./data",
    cacheDir: env["XDG_CACHE_HOME"] ?? "./cache",
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
    embeddingDatabase: {
      url: `file:${paths.dataDir}/embeddings.db`,
    },
    embedding: {
      cacheDir: `${paths.cacheDir}/embeddings`,
    },
  };
}
