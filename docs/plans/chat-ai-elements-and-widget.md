# Plan: official AI Elements adoption + future dashboard chat widget

## Status

Proposed direction. This supersedes the earlier “homebrew ai-elements layer”
framing: the goal is to align the web chat UI with the official Vercel AI
Elements registry and stop treating our local chat primitives as an independent
component system.

## Context

`@brains/web-chat` renders as a React 19 island at `/chat`. The dashboard and
most other user-facing UI run under preact 10 with SSR via
`preact-render-to-string` and per-island hydration. These runtimes currently
coexist on separate routes.

Vercel AI Elements is not a conventional component package that we import from
at runtime. It is a shadcn-style registry/CLI workflow: components are installed
into the app source tree. That means some local source files are expected, but
they must be treated as **registry-derived AI Elements components**, not a
homegrown fork that happens to use the same folder name.

The current web-chat branch has started that correction:

- `Message`, `MessageContent`, and `MessageResponse` now follow the official AI
  Elements `message` component shape.
- `MessageResponse` uses `streamdown` plus the AI Elements Streamdown plugin
  set.
- `Conversation` now follows the official AI Elements `conversation` pattern
  using `use-stick-to-bottom`.
- The old standalone `markdown-response.tsx` wrapper has been removed.

## Goals

- Make AI Elements the canonical source for chat UI primitives.
- Avoid inventing parallel local primitives for message, response,
  conversation, prompt input, tools, reasoning, sources, actions, and related
  affordances.
- Keep React quarantined under `interfaces/web-chat/ui-react/`.
- Preserve Rizom styling through CSS/tokens and minimal class adaptation, not by
  rewriting component behavior from scratch.
- Keep `/chat` on AI SDK UI transport and the existing web-chat HTTP boundary.
- Make the bundled full chat anchor-only by default so durable sessions,
  confirmations, and tool access share one clear permission model.
- Defer public/trusted chat until there is an explicit abuse-mitigation design.
- Defer any dashboard widget until there is a concrete product surface.

## Non-goals

- Migrating `@brains/web-chat` off React.
- Pulling React into the preact dashboard page runtime.
- Treating the old local `ui-react/src/ai-elements/*` files as canonical.
- Building a bespoke artifact/tool/reasoning system before checking the AI
  Elements component/protocol shape.
- Shipping a dashboard mini-chat before the placement and UX are real.

## Decisions

### 1. Full web chat is anchor-only by default

The full `/chat` surface should require an operator/anchor session. This keeps
page access, chat POSTs, conversation-service-backed sessions, session message
loading, confirmations, and sensitive tool access under one permission model.

Current public/trusted chat is deferred. A public chat would be fun, but it has
real token-abuse and tool-exposure risks. If we add it later, it should be an
explicit opt-in mode with safeguards such as:

- strict per-IP/session rate limits
- public-permission tools only
- short max response/token budget
- no durable operator-style session sidebar by default
- abuse logging and a deploy-level kill switch
- optional CAPTCHA, email gate, or invite token

Until that exists, `/chat` should not silently behave as public chat with broken
or missing sessions.

### 2. AI Elements is canonical; local files are generated/adapted registry code

Use the official registry workflow as the starting point for chat primitives:

```sh
cd interfaces/web-chat/ui-react
npx ai-elements@latest add <component>
```

Because AI Elements is registry-based, installed files live locally. That does
**not** mean we own an independent design-system fork. The expected workflow is:

1. Install or inspect the official registry component.
2. Keep its public component shape and behavior as close to upstream as
   possible.
3. Adapt imports/build details only where required by this repo.
4. Apply Rizom visual styling via CSS classes/tokens.
5. Document any deliberate divergence in the component file or local README.

If a component starts drifting into a custom implementation, stop and re-check
upstream AI Elements before continuing.

### 3. Styling is ours; behavior and structure should remain AI Elements-aligned

Rizom theme variables, typography, spacing, and interaction styling remain ours.
But the component contracts and behavior should follow AI Elements where
possible.

Good adaptations:

- Replace upstream path aliases with local relative imports.
- Add stable `web-chat-*` classes for styling hooks.
- Use our CSS variables instead of Tailwind-only visual assumptions.
- Omit optional upstream subcomponents that are unused, if the remaining API is
  still clearly AI Elements-derived.

Bad adaptations:

- Replacing an AI Elements primitive with a completely different local API.
- Reimplementing markdown parsing, tool rendering, artifacts, sources, or
  reasoning from scratch.
- Creating local components named like AI Elements but with unrelated behavior.

### 4. React `/chat` and preact dashboard remain separate runtimes

The full `/chat` route remains the React AI SDK UI surface. Dashboard pages
remain preact/SSR. They should not import from each other.

The contract between surfaces is the HTTP/API boundary, not shared component
code.

### 5. Dashboard chat widget is deferred and should be designed separately

A dashboard widget may eventually make sense, but it should wait until there is
a specific dashboard placement and UX.

When that happens, choose the implementation based on the surface:

- If it can be isolated as a React island without colliding with the dashboard,
  it may reuse the AI Elements/AI SDK UI stack.
- If it must be a preact-native dashboard island, build only the minimal widget
  needed and keep it behind the same `/api/chat` protocol.

Do not preemptively fork a full mini-chat implementation now.

## Architecture sketch

```text
@brains/web-chat                         React, /chat surface
  src/                                   anchor-only route plugin + AI SDK UI stream endpoint
  ui-react/src/
    App.tsx                              full-page chat shell
    main.tsx                             createRoot mount for /chat
    ai-elements/                         AI Elements registry-derived components
      conversation.tsx                   registry-aligned, use-stick-to-bottom
      message.tsx                        registry-aligned Message/Content/Response
      prompt-input.tsx                   next candidate for registry alignment
      data-parts.tsx                     temporary; replace/align with Tool/etc.
      reasoning.tsx                      future registry component if needed
      tool.tsx                           future registry component if needed
      ...

plugins/dashboard                        preact, SSR + islands
  src/render/islands/
    MiniChat.tsx                         future only, if a concrete dashboard UX asks for it
```

## Next steps

### 1. Make `/chat` consistently anchor-only

Before merging the current branch to `main`, align the HTTP routes with the
permission model:

- `/chat` should require an operator/anchor session or render a clear sign-in
  required state.
- `/api/chat` should reject unauthenticated public callers instead of falling
  back to `public` permission.
- `/api/chat/sessions`, `/api/chat/messages`, and `/api/chat/confirm` should
  remain anchor-only and continue to use the conversation service.

### 2. Finish AI Elements alignment of existing primitives

The first pass aligned message/response/conversation. Continue with the existing
local primitives in this order:

1. `prompt-input.tsx` → align with official AI Elements `prompt-input` API where
   practical, while keeping current simple UX if attachments/model menus are not
   needed yet.
2. `data-parts.tsx` → replace generic tool-result display with AI
   Elements-derived `tool` patterns.
3. Add `reasoning`, `sources`, `actions`, or `suggestions` only when the backend
   emits the corresponding UI parts or the product surface needs them.

### 3. Add local AI Elements adoption notes

Add a short README under `interfaces/web-chat/ui-react/src/ai-elements/` that
states:

- AI Elements is the canonical source.
- Files in this directory are registry-derived/adapted, not homebrew.
- Use `npx ai-elements@latest add <component>` or inspect the registry before
  changing component behavior.
- Prefer CSS/token styling over behavioral rewrites.
- Document any divergence from upstream.

### 4. Validate in browser before release

Before merging this branch to `main`, run the targeted checks and do a visual
browser pass of `/chat`:

```sh
bun run --filter @brains/web-chat build
bun test interfaces/web-chat/test
bun run --filter @brains/web-chat typecheck
bun run --filter @brains/web-chat lint
```

Browser pass should cover:

- Empty state
- Sending a message
- Streaming markdown
- Code blocks
- Session switching
- Tool result collapse/expand
- Confirmation approve/decline
- Light/dark mode

## Open questions

- What should the future public/trusted chat abuse controls be: rate limits,
  token budgets, CAPTCHA/email/invite gate, or all of the above?
- Which AI Elements components do we need next: prompt input, tool, reasoning,
  sources, actions, suggestions, or artifact?
- Do outbound artifacts map cleanly to existing AI Elements artifact/tool
  patterns, or do we need a protocol decision first?
- If a dashboard chat widget becomes real, should it be an isolated React island
  or a preact-native minimal widget?
