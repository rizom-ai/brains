import type { RuntimeAppInfo } from "@brains/plugins";

/**
 * A complete `RuntimeAppInfo`, for a test that needs one but cares about a
 * field or two of it.
 *
 * `RuntimeAppInfo` has eleven required members and grows; a test asserting on
 * `ai.model` alone used to assert a two-field literal into place, which meant
 * the fixture stopped compiling honestly the moment a member was added.
 * Overrides are shallow-merged, and `ai` is merged one level deeper because
 * that is the part tests actually vary.
 */
export function createTestAppInfo(
  overrides: Omit<Partial<RuntimeAppInfo>, "ai"> & {
    ai?: Partial<RuntimeAppInfo["ai"]>;
  } = {},
): RuntimeAppInfo {
  const { ai, ...rest } = overrides;
  return {
    model: "test-brain",
    version: "1.0.0",
    uptime: 0,
    entities: 0,
    entityCounts: [],
    embeddings: 0,
    backgroundWork: {
      status: "operational",
      reasons: [],
      worker: {
        state: "active",
        activeSessions: 1,
        staleSessions: 0,
        latestHeartbeatAgeMs: 0,
      },
      queue: {
        duePending: 0,
        processing: 0,
        oldestDuePendingAgeMs: null,
        latestClaimAgeMs: null,
        stalled: false,
      },
    },
    daemons: [],
    endpoints: [],
    interactions: [],
    ...rest,
    ai: {
      model: "gpt-4.1",
      embeddingModel: "text-embedding-3-small",
      ...ai,
    },
  };
}
