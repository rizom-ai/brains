import type { AppInfo } from "@brains/plugins";

export function createMockAppInfo(overrides: Partial<AppInfo> = {}): AppInfo {
  const base: AppInfo = {
    version: "0.0.0",
    model: "test-model",
    uptime: 0,
    entities: 0,
    entityCounts: [],
    embeddings: 0,
    ai: {
      model: "test-model",
      embeddingModel: "test-embedding-model",
    },
    daemons: [],
    endpoints: [],
    interactions: [],
  };
  return { ...base, ...overrides };
}
