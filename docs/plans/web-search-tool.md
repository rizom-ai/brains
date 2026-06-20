# Plan: Web search as an explicit tool capability

## Status

Proposed.

## Background

Users keep asking for current web information. Vercel AI SDK and some model providers already expose native web-search switches, but a raw model flag does not match the brain runtime model:

- tools are explicit, permissioned, and plugin-provided;
- tool calls emit lifecycle events and are visible to interfaces;
- plugin behavior is provider-neutral;
- shell services should not depend on a specific model provider;
- privacy, budget, and audit policy belong at the tool/runtime layer, not hidden inside model options.

The current `AIModelConfig.webSearch?: boolean` / Anthropic `providerOptions.webSearch` path is useful as a spike, but it bypasses too much of the system's normal control surface to be the long-term design.

## Goal

Add web search as a normal first-party plugin/tool capability:

- `web_search` searches the public web and returns structured results with URLs;
- optional later `web_fetch` retrieves a single URL's readable content;
- tools are registered through the existing plugin/MCP service path;
- tools are filtered by permission level and visible in tool-status UI;
- providers are swappable behind one contract;
- search use is logged and auditable;
- privacy defaults prevent silently sending private conversation context to search providers.

## Non-goals

- Do not make web search always-on model behavior.
- Do not expose provider-native search directly as the product contract.
- Do not add crawling, indexing, long-term page storage, or RAG ingestion in the first slice.
- Do not require all models/providers to support native search.
- Do not answer from raw snippets without URLs when search was used.

## Design principles

1. **Separate tool, not model flag.** The agent searches by invoking `web_search`, just like any other capability.
2. **Provider-neutral contract.** Brave, Tavily, SerpAPI, Exa, SearXNG, or provider-native search are implementation choices.
3. **Visible and auditable.** Interfaces can show "searching…" through existing tool lifecycle events; logs capture provider/query/result URLs.
4. **Privacy by default.** The tool receives only the explicit query argument. It does not receive full conversation history unless a future config explicitly opts in.
5. **Permissioned capability.** Default visibility should be conservative. Brains may expose search to `trusted`/`public`, but that must be deliberate.

## Proposed tool contracts

### `web_search`

```ts
input: {
  query: string;
  maxResults?: number; // bounded by config
  freshness?: "day" | "week" | "month" | "year" | "any";
  site?: string;
}

output: {
  success: true;
  data: {
    query: string;
    provider: string;
    results: Array<{
      title: string;
      url: string;
      snippet?: string;
      publishedAt?: string;
      source?: string;
    }>;
  };
}
```

### `web_fetch` — later slice

```ts
input: {
  url: string;
}

output: {
  success: true;
  data: {
    url: string;
    title?: string;
    content: string;
    fetchedAt: string;
  };
}
```

`web_fetch` should wait until there is a clear need. Many search providers already return enough snippets for current-info answers, and fetching arbitrary pages adds more security and content-safety surface.

## Configuration shape

Example brain/app config:

```yaml
webSearch:
  enabled: true
  provider: brave # brave | tavily | searxng | native
  visibility: trusted # anchor | trusted | public
  maxResults: 5
  maxQueriesPerTurn: 3
  apiKey: ${WEB_SEARCH_API_KEY}
  privacy:
    allowConversationContext: false
```

Open question during implementation: whether this lives under top-level plugin config or under `ai.capabilities.webSearch`. The runtime behavior should remain the same either way: config enables a plugin tool, not a hidden model option.

## Architecture

```txt
Brain/plugin config
  ↓
web-search plugin registers web_search tool
  ↓
MCP service stores tool with visibility
  ↓
AgentService filters tools by permission level
  ↓
ToolLoopAgent receives web_search as an SDK tool
  ↓
convertToSDKTools emits tool lifecycle events
  ↓
provider adapter executes search
  ↓
assistant answers with cited URLs
```

### Packages / likely files

- New plugin package, likely `plugins/web-search` or `shell/core` system plugin if treated as core capability.
- Shared provider contract near the plugin, not in `shell/ai-service`.
- `shell/ai-service/src/types.ts`: deprecate or remove `AIModelConfig.webSearch` once the tool path exists.
- `shell/ai-service/src/brain-agent.ts`: remove provider-specific web-search injection from the general agent factory, or keep it only behind an explicitly named experimental/native adapter.
- Interface work should be minimal because existing tool lifecycle events already cover status.

## Provider adapter contract

```ts
export interface WebSearchProvider {
  readonly id: string;
  search(input: WebSearchInput): Promise<WebSearchResult[]>;
}
```

Provider adapters should normalize:

- result URL;
- title;
- snippet;
- publication date when available;
- source/domain.

First adapter recommendation: start with one simple hosted provider plus a test/mock provider. SearXNG is attractive for self-hosting later, but it should not block the first slice.

## Agent instructions

The plugin should contribute short instructions such as:

- Use `web_search` only when current or external information is needed.
- Do not send private user data, secrets, emails, or full conversation history as search queries.
- When using search results, cite the result URLs in the final answer.
- If results are inconclusive, say so instead of overstating.

## Privacy and policy

Minimum first-slice safeguards:

- Query argument is generated explicitly by the model; no automatic history forwarding.
- Tool logs include query/provider/result URLs, but not full page content.
- Configurable max results and max queries per turn.
- Conservative default visibility, preferably `anchor` unless a brain opts down to `trusted` or `public`.
- If a query appears to contain secrets or private data, the tool may reject with a clear error and ask the model to retry with a redacted query.

## Native provider search

Provider-native search can still be useful, but it should be treated as a backend or experimental optimization, not the public abstraction.

Acceptable uses:

- `provider: native` adapter, if the SDK/provider can expose enough trace/citation data;
- model-specific experiments in evals;
- fallback disabled by default if traceability is insufficient.

Avoid:

```ts
providerOptions: {
  anthropic: {
    webSearch: true;
  }
}
```

as the long-term user-facing feature, because it is provider-specific and bypasses normal tool policy.

## Implementation phases

### Phase 1 — contract and mock

- Add a plan-approved tool schema and output schema.
- Implement a mock/test provider.
- Add plugin tests for input bounds, permission visibility, and normalized output.
- Add instructions requiring citations and redacted queries.

### Phase 2 — first real provider

- Add one provider adapter behind config/env.
- Add timeout, result limits, and clear error mapping.
- Emit structured logs for provider, query, count, and result URLs.
- Validate through a targeted brain test app.

### Phase 3 — product polish

- Confirm web/chat/Discord status rendering is acceptable using existing tool lifecycle events.
- Add docs for enabling web search in a brain.
- Add evals for: current-info question, no-search-needed question, private-data redaction, and citation behavior.

### Phase 4 — native search decision

- Evaluate AI SDK provider-native search only after the separate tool works.
- Keep it only if it can preserve traceability, citations, permissions, and budgets.
- Remove or deprecate the existing boolean flag path if it remains less controllable.

## Validation

Targeted checks:

- plugin unit tests for `web_search` schema and provider normalization;
- permission tests: tool is absent below configured visibility;
- agent/tool-loop test: model can call `web_search` and answer with URLs;
- privacy test: query containing obvious secret/private data is rejected or redacted;
- typecheck for affected packages.

Manual checks:

- Ask a current-info question and verify visible tool status plus cited URLs.
- Ask a stable/internal question and verify no search is used.
- Ask to search with a private email/API key and verify redaction behavior.

## Open questions

1. Should the first real provider be Brave, Tavily, Exa, or SearXNG?
2. Should default visibility be `anchor` or `trusted` when enabled?
3. Should `web_fetch` ship in the same plugin later, or remain a separate capability?
4. Where should hosted deployments store per-tenant search budget and usage counters?
