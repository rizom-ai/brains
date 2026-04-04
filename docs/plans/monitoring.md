# Plan: Monitoring — Pre-Release

## Context

The brain has a `Logger` class with levels (debug/info/warn/error) that writes to console. The `/health` endpoint returns `{ status: "healthy" }`. There's no usage tracking, no structured output, no diagnostics beyond what the operator can grep from terminal output.

When a user's brain breaks, there's no log file to share. When they want to know their AI spend, there's no record. When `/health` says "healthy" but search returns nothing, there's no way to see that `embeddings.db` is empty.

## Pre-Release Phases

### Phase 1: Structured log output

The `Logger` class already handles levels and child contexts. What's missing:

1. **JSON mode** — `Logger` gains a `format: "json" | "text"` option. JSON mode outputs one JSON object per line: `{"ts":"...","level":"info","ctx":"EntitySearch","msg":"Found 3 results"}`. Text mode is current behavior (human-readable).
2. **Log file** — `Logger` gains optional `logFile` path. Writes to file alongside console. File always uses JSON format. Rotated by size (10MB default).
3. **Suppress noisy messages** — "No handlers found for message type" at info level is noise. Move to debug. Same for job-progress messages.
4. **stderr for all log output** — Production brain should log to stderr so stdout is clean for MCP JSON-RPC. The `useStderr` flag exists but isn't default in production.

**Config:**

```yaml
# brain.yaml
logging:
  level: info # debug | info | warn | error
  format: text # text | json
  file: ./data/brain.log # optional, always JSON
```

**Files:** `shared/utils/src/logger.ts`, `shell/core/src/config/shellConfig.ts`, `shell/messaging-service/` (suppress noisy messages)

### Phase 2: Health enrichment

Extend `/health` from `{ status: "healthy" }` to useful diagnostics:

```json
{
  "status": "healthy",
  "version": "0.1.0",
  "uptime": 3600,
  "databases": {
    "entities": { "status": "ok", "entities": 230 },
    "embeddings": { "status": "ok", "embeddings": 228 },
    "jobs": { "status": "ok", "pending": 0, "processing": 0 }
  },
  "sync": {
    "lastSync": "2026-04-04T16:00:00Z",
    "status": "ok"
  },
  "ai": {
    "provider": "openai",
    "model": "gpt-4.1",
    "embeddingModel": "text-embedding-3-small",
    "keyValid": true
  }
}
```

The health endpoint already exists in `ServerManager`. Enrichment means:

1. Shell exposes a `getHealthInfo()` method that collects from services
2. Health route calls it instead of returning a static object
3. Each service contributes its health status (entity count, job queue depth, sync status, AI key validity)

**Files:** `shell/core/src/shell.ts`, `interfaces/webserver/src/server-manager.ts`, `shell/entity-service/`, `shell/job-queue/`, `shell/ai-service/`

### Phase 3: Usage tracking

Track AI API usage in a local SQLite table. No external service, no network — just a record of what the brain consumed.

```sql
CREATE TABLE usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  operation TEXT NOT NULL,      -- 'text_generation' | 'embedding' | 'image_generation'
  provider TEXT NOT NULL,       -- 'openai' | 'anthropic' | 'google'
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_estimate REAL,           -- estimated USD based on published pricing
  entity_type TEXT,             -- which entity triggered this (optional)
  entity_id TEXT                -- which entity triggered this (optional)
);
```

1. `UsageTracker` class wraps a SQLite table in `brain.db` (or `data/usage.db`)
2. `OnlineEmbeddingProvider` logs embedding calls (token count from API response)
3. `AIService` logs text generation calls (input/output tokens from AI SDK)
4. `brain status` includes a usage summary (total tokens today, estimated cost)
5. `brain diagnostics usage` shows detailed breakdown by model/operation/day

**Files:** new `shell/usage-tracker/`, `shell/ai-service/src/aiService.ts`, `shell/entity-service/src/online-embedding-provider.ts`, CLI commands

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

Phase 1:

1. `brain start` with `logging.format: json` outputs JSON lines to stderr
2. `logging.file` writes JSON to disk
3. No "No handlers found" noise at info level
4. Log file exists after boot, contains structured entries

Phase 2:

1. `GET /health` returns enriched JSON with entity count, embedding count, job queue depth
2. Health reflects actual state (empty embeddings.db → embeddings count 0)
3. AI key validity checked without making a generation call

Phase 3:

1. After boot + sync, `usage.db` contains embedding call records
2. After a chat, `usage.db` contains text generation records
3. `brain status` shows today's token usage
4. `brain diagnostics usage` shows breakdown by model
