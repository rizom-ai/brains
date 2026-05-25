# Plan: official AI Elements adoption + future dashboard chat widget

## Status

Initial adoption implemented. The web chat now uses official AI Elements
registry-derived components for message, conversation, prompt input, and tool
display, with React still quarantined under `interfaces/web-chat/ui-react/` and
Rizom styling applied through CSS hooks/tokens.

This document now tracks the remaining AI Elements/Web UI follow-ups: visual
polish, richer structured parts such as reasoning/sources/actions/artifacts when
the backend emits them, public/trusted chat safeguards, and any future dashboard
widget.

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

The web-chat AI Elements correction has landed:

- `Message`, `MessageContent`, and `MessageResponse` follow the official AI
  Elements `message` component shape.
- `MessageResponse` uses `streamdown` plus the AI Elements Streamdown plugin
  set.
- `Conversation` follows the official AI Elements `conversation` pattern using
  `use-stick-to-bottom`.
- `PromptInput` and `Tool` are registry-derived/adapted components rather than
  local primitives with unrelated behavior.
- Local adoption notes live in
  `interfaces/web-chat/ui-react/src/ai-elements/README.md`.
- The old standalone markdown parser/wrapper path has been removed.

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
      prompt-input.tsx                   registry-derived/adapted PromptInput
      data-parts.tsx                     temporary bridge for backend data parts
      reasoning.tsx                      future registry component if backend emits reasoning
      tool.tsx                           registry-derived/adapted Tool card
      ...

plugins/dashboard                        preact, SSR + islands
  src/render/islands/
    MiniChat.tsx                         future only, if a concrete dashboard UX asks for it
```

## Remaining next steps

### 1. Keep `/chat` visually production-ready

Run targeted checks and a browser pass whenever the bundled web chat UI changes:

```sh
bun run --filter @brains/web-chat build
bun test interfaces/web-chat/test
bun run --filter @brains/web-chat typecheck
bun run --filter @brains/web-chat lint
```

Browser pass should cover:

- Empty state
- Sign-in required state
- Sending a message
- Streaming markdown
- Code blocks and long-message overflow
- Session switching and new-session flow
- Tool result collapse/expand
- Confirmation approve/decline
- Light/dark mode
- Mobile drawer/header/action layout

### 2. Add richer AI Elements parts only when backed by protocol

Do not add `reasoning`, `sources`, `actions`, `suggestions`, or artifact UI as
standalone component work. Add the registry component when the backend emits the
corresponding structured part or a concrete product surface needs it.

### 3. Decide outbound artifact mapping

Before implementing artifact cards, decide whether generated images, PDFs,
exports, previews, and downloads map to existing AI Elements artifact/tool/data
patterns or need a small Brain-specific `data-attachment` contract.

### 4. Keep public/trusted chat deferred behind safeguards

The full chat remains anchor-only. Public/trusted chat requires an explicit
abuse-control design before implementation.

### 5. Keep dashboard chat widget deferred

A dashboard widget should be designed only when there is a concrete dashboard
placement and UX. Until then, `/chat` remains the canonical full chat surface.

## Open questions

- What should the future public/trusted chat abuse controls be: rate limits,
  token budgets, CAPTCHA/email/invite gate, or all of the above?
- Which AI Elements components do we need next after the backend emits matching
  structured parts: reasoning, sources, actions, suggestions, or artifact?
- Do outbound artifacts map cleanly to existing AI Elements artifact/tool
  patterns, or do we need a protocol decision first?
- If a dashboard chat widget becomes real, should it be an isolated React island
  or a preact-native minimal widget?
