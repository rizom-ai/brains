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

The current `AIModelConfig.webSearch?: boolean` path is **not a working spike — it is dead code that silently no-ops** (verified against the installed SDK; see [Dead code path to remove](#dead-code-path-to-remove)). Removing it is part of this work, not a fallback to preserve.

## Scope

Ephemeral-first: results are returned to the agent for the current turn and are not persisted. Capturing selected results as reviewed entities is a deliberate **later** seam — it would hook in behind the same human-review gate already used for entity creation, but is out of scope for the first slices (see Non-goals).

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

## Dead code path to remove

The existing `webSearch` flag defaults to `true` and is wired through to **two** sinks, **both of which are no-ops** — neither reaches a real web search:

1. `brain-agent.ts` sets `providerOptions: { anthropic: { webSearch: true } }`. The installed `@ai-sdk/anthropic@3.0.58` provider-options schema has **no `webSearch` key** (it recognizes `thinking`, `effort`, `cacheControl`, `mcpServers`, `disableParallelToolUse`, `sendReasoning`, `structuredOutputMode`, `container`, `toolStreaming`, `speed`, `anthropicBeta`, `contextManagement`). Unknown keys are dropped. In this SDK, Anthropic web search is a **provider-defined tool** (`anthropic.tools.webSearch_20260209()` / `webSearch_20250305()`), not a provider option — so the flag never enables anything.
2. `generation-options.ts` sets `options.webSearch = true`, which is spread into the `generateText` / `generateObject` calls in `aiService.ts`. The AI SDK has no top-level `webSearch` parameter either — also dropped.

So the README's claim that web search defaults to on is false; remove that too. Full removal list (verified, non-test):

- `shell/ai-service/src/types.ts` — `AIModelConfig.webSearch`
- `shell/ai-service/src/generation-options.ts` — `webSearch` field on `TextGenerationOptions`, the `?? true` default, and the `if (config.webSearch)` block
- `shell/ai-service/src/brain-agent.ts` — `webSearch` param + the `providerOptions.anthropic.webSearch` spread
- `shell/core/src/initialization/service-config.ts` and `identity-agent-services.ts` — the `webSearch` pass-through
- `shell/core/src/config/shellConfig.ts` — the `webSearch: z.boolean().default(true)` schema field and its override default
- `shell/ai-service/README.md` — the `webSearch` config row and the `webSearch: true` default note
- `shell/ai-service/test/aiService.test.ts` — two assertions (≈ lines 227, 386) that currently lock in the dead `webSearch: true` behavior

This removal is **Phase 0** (below): land it before, or as the first commit of, the plugin work, so there is never a live no-op flag competing with the real tool. It is independent of provider choice and can ship on its own.

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

**Extraction provider — reuse Jina, do not add a second extractor.** When `web_fetch` lands, back it with the existing Jina Reader (`https://r.jina.ai/<url>`) via the `UrlFetcher` in `entities/link/src/lib/url-fetcher.ts` — already proven, returns clean markdown, free at low volume (20 RPM anon / 500 RPM with key). The decision is driven by **consistency, not an extraction-quality gap**: `entities/link` already standardizes on Jina for link capture, so reusing it keeps the codebase to **one extraction path** rather than introducing a second for the same job. Jina's markdown-structure preservation and JS-page rendering also happen to fit this system (link content is stored as markdown entities; the agent reasons in markdown) — a modest edge over Tavily Extract's raw-text output, though the two are close on pure quality.

Note this deliberately splits vendors by job: **Tavily for search** (query → ranked results), **Jina for fetch** (URL → markdown). Keep both behind the swappable provider contract so Tavily Extract remains a drop-in _only if_ hosted-scale single-vendor budget consolidation later justifies it — at which point the move is to migrate `entities/link` onto Tavily too, not to run two extractors.

## Configuration shape

Example brain/app config:

```yaml
webSearch:
  enabled: true
  provider: tavily # tavily (first) | brave | searxng | native
  visibility: trusted # anchor | trusted | public
  maxResults: 5
  maxQueriesPerTurn: 3
  apiKey: ${WEB_SEARCH_API_KEY}
  privacy:
    allowConversationContext: false
```

This is **plugin config**, matching every other plugin (e.g. `stock-photo` takes `{ provider, apiKey }` and returns no tools when `apiKey` is unset — the same gate works here). Do not route it under `ai.capabilities.webSearch`: that would thread config back through `shell/ai-service`, re-introducing the exact provider/model coupling Phase 0 removes. Config enables a plugin tool, never a model option.

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

**First adapter: Tavily**, plus a test/mock provider. Tavily is built for LLM agents — it returns ranked, clean, snippet/content-rich results that map almost 1:1 onto the output contract above (`title`/`url`/`snippet`/`publishedAt`/`source` + freshness), so the adapter is mostly field-mapping rather than SERP massaging. Its free tier also lets the walking skeleton answer the real open question — are results good enough to bother — before any spend.

**Brave** is the planned second adapter: an independent index (no Google/Bing proxy ToS), privacy-positioned, cheaper per query at scale — the right choice once the feature is validated and cost/independence matter for hosted multi-tenant use. It hands back raw search rows, so the adapter does more normalization than Tavily's. SearXNG (self-hosted, privacy-max) and Exa (neural/research-discovery) stay later options; SerpAPI is out (Google proxy, expensive, legally grey).

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

The structural guarantee — the tool receives only the model-generated `query` argument, never conversation history — is what makes the first slice safe, and it comes for free from the tool contract. Heuristic secret/PII detection that rejects or redacts suspicious queries is **later hardening**, not a first-slice requirement: the detector is itself error-prone, and nothing private is forwarded without it. Defer it (and its validation test) to Phase 3 or beyond rather than blocking the walking skeleton on it.

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

as the long-term user-facing feature, because it is provider-specific and bypasses normal tool policy. Note this exact shape is also simply **wrong** in the current SDK — it is the dead path Phase 0 removes. A real native adapter would register the provider-defined tool (`anthropic.tools.webSearch_20260209()`) into the ToolSet, not set a provider option; even then it executes server-side at Anthropic, so it would not flow through `convertToSDKTools` lifecycle events or permission filtering — which is exactly why it stays a backend detail, not the contract.

## Implementation phases

### Phase 0 — remove the dead flag

- Delete every site in [Dead code path to remove](#dead-code-path-to-remove); update the two `aiService.test.ts` assertions rather than deleting their surrounding cases.
- Pure subtraction, no behavior change (the flag never did anything). Ships independently of the rest of the plan.

### Phase 1 — contract and mock

- Add a plan-approved tool schema and output schema.
- Implement a mock/test provider.
- Add plugin tests for input bounds, permission visibility, and normalized output.
- Add instructions requiring citations and not sending private data as queries.

### Phase 2 — first real provider (Tavily)

- Add the Tavily adapter behind config/env.
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
- typecheck for affected packages.

Deferred to the secret-detection hardening slice (Phase 3+):

- privacy test: query containing obvious secret/private data is rejected or redacted.

Manual checks:

- Ask a current-info question and verify visible tool status plus cited URLs.
- Ask a stable/internal question and verify no search is used.
- (Phase 3+) Ask to search with a private email/API key and verify redaction behavior.

## Open questions

1. ~~Should the first real provider be Brave, Tavily, Exa, or SearXNG?~~ **Decided: Tavily first** (built for agents, citation-ready content, free tier to validate quality), Brave as the planned second adapter.
2. Should default visibility be `anchor` or `trusted` when enabled?
3. Should `web_fetch` ship in the same plugin later, or remain a separate capability?
4. Where should hosted deployments store per-tenant search budget and usage counters?

   **Free-tier sizing (Tavily, verified June 2026):** 1,000 API credits/month, no credit card, no rollover; basic search = 1 credit, advanced = 2. So ~1,000 basic searches/month. The agent decides when to search (current/external info needed — see Agent instructions), so volume tracks real demand, not a fixed per-turn cost. That envelope comfortably covers Phase 0–3 validation (dogfooding + a few brains). It runs out at hosted multi-tenant scale, where a single active user can exhaust it — that is the trigger for pay-as-you-go ($0.008/credit), the Brave second adapter, and these per-tenant counters. **Cost control is a budget ceiling (`maxQueriesPerTurn` + per-tenant caps), not a behavioral gate** — the model is left free to search when needed; the cap bounds spend, and visible tool-status keeps it transparent. Sources: [Tavily credits docs](https://docs.tavily.com/documentation/api-credits), [pricing](https://tavily.com/pricing).

5. Tool naming: existing plugins namespace tools as `${pluginId}_<verb>` (e.g. `stock-photo_search`), which would yield `web-search_search`. Follow the convention, or special-case a bare `web_search`? The plan body currently assumes the bare form — pick one and apply it consistently.
