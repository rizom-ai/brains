# Plan: Monitoring — Pre-Release

## Context

The brain had a `Logger` class with levels but no JSON output, no file support. The `/health` endpoint returned `{ status: "healthy" }`. No usage tracking, no diagnostics beyond what the operator could grep from terminal output.

## Phases

### Phase 1: Structured log output ✅

Done. Logger gains:

- `format: "text" | "json"` option (JSON is one object per line)
- `logFile` option (always JSON, shared file handle across child loggers)
- Configurable via `brain.yaml`:

```yaml
logging:
  level: debug
  format: text
  file: ./data/brain.log
```

Noise suppression: "No handlers found" moved from warn to debug. `brain diagnostics` boots with `level: warn` to suppress plugin registration output.

### Phase 2: Health enrichment + simplified AppInfo ✅

Done. `AppInfo` simplified to essential diagnostics:

```json
{
  "model": "rover",
  "version": "0.1.0",
  "uptime": 3600,
  "entities": 230,
  "embeddings": 228,
  "ai": {
    "model": "gpt-4.1",
    "embeddingModel": "text-embedding-3-small"
  },
  "daemons": [...]
}
```

Removed plugin list, tool list, interface list (available via MCP resources). Health endpoint composes `getAppInfo()` from `Shell` via dependency injection into `WebserverInterface` → `ServerManager`.

### Phase 3: Usage tracking via structured logs

Track AI API usage through the existing logging infrastructure — no new database.

AI calls log structured usage events:

```json
{
  "ts": "2026-04-05T10:00:00Z",
  "level": "info",
  "ctx": "UsageTracker",
  "msg": "ai:usage",
  "data": [
    {
      "operation": "embedding",
      "provider": "openai",
      "model": "text-embedding-3-small",
      "inputTokens": 42,
      "outputTokens": 0,
      "costEstimate": 0.0000008
    }
  ]
}
```

**Why logs, not SQLite:**

- No new schema, no migrations, no new DB file
- Reuses the JSON log file infrastructure from Phase 1
- Usage events are semantically operational history — they belong in logs
- Grepable with `jq` for ad-hoc queries
- Aggregation is O(log size) but that's fine for personal brains (~1000 calls/day)
- If it becomes slow post-release, add a SQLite index. But start simple.

**Interface changes:**

`IEmbeddingService.generateEmbedding()` returns `{ embedding, usage }` instead of just `Float32Array`. Callers destructure. Every mock of `IEmbeddingService` updates.

`AIService` already gets usage from the AI SDK — surface it in the return type.

**Wiring:**

`Shell` creates a `UsageTracker` that wraps the logger. Services log through it:

```typescript
usageTracker.record({
  operation: "embedding",
  provider: "openai",
  model: "text-embedding-3-small",
  inputTokens: result.usage.tokens,
});
```

`record()` is a thin wrapper that emits a structured log entry with `msg: "ai:usage"`.

**CLI:**

- `brain status` includes today's token total (tails the log, filters for `ai:usage`, sums `inputTokens + outputTokens`)
- `brain diagnostics usage` shows detailed breakdown by model/operation/day

**Files affected:**

- `shell/entity-service/src/embedding-types.ts` — interface change
- `shell/ai-service/src/online-embedding-provider.ts` — return usage
- `shell/entity-service/src/handlers/embeddingJobHandler.ts` — destructure
- `shell/entity-service/src/entity-search.ts` — destructure
- `shell/ai-service/src/aiService.ts` — surface usage from AI SDK
- New: `shell/core/src/usage-tracker.ts` — record/query helpers
- `shell/core/src/initialization/shellInitializer.ts` — wire tracker
- `shell/app/src/cli.ts` — `brain status`, `brain diagnostics usage`
- All test files that mock `IEmbeddingService` (widespread)

**Cost estimation:**

Pricing table maintained in `usage-tracker.ts`. Update when provider prices change. Small table, ~10 entries.

```typescript
const PRICING = {
  "text-embedding-3-small": { input: 0.02 / 1_000_000 },
  "gpt-4.1": { input: 5 / 1_000_000, output: 15 / 1_000_000 },
  // ...
};
```

## Post-Release

### Alerting

Push notifications when brain is unhealthy:

- Embedding DB out of sync (entity count != embedding count)
- API key expired (401 errors)
- Disk full
- Job queue backed up

### Web dashboard

Visual monitoring page showing health, usage charts, recent errors. Uses the existing dashboard infrastructure.

### Remote monitoring

Push health metrics to a central service for hosted brains. Heartbeat, usage aggregation, fleet-wide view.

## Verification

Phase 3:

1. After boot + sync, `brain.log` contains `ai:usage` entries for embedding calls
2. After a chat, log contains `ai:usage` entries for text generation
3. `brain status` shows today's token total
4. `brain diagnostics usage` shows breakdown by model
