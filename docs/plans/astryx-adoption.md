# Astryx adoption pilot

## Status

Proposed and exploratory. This plan evaluates Meta's Astryx design system on the React-based operator console without committing the repository to a broad migration. The first and only approved pilot surface is `interfaces/web-chat`; CMS adoption requires a separate go/no-go decision after the pilot.

Baseline evaluated on 2026-07-20 against `@astryxdesign/core@0.1.6`. Astryx is currently beta and must be pinned exactly during the pilot.

This work is demand-gated and must not preempt the roadmap's P0/P1 release and identity work without an explicit priority change.

## Goal

Determine whether Astryx can reduce custom interaction code and improve accessibility in the React operator interfaces while preserving:

- the existing Rizom console identity;
- the paper and instrument climates from `@brains/console-theme`;
- Brain-specific chat behavior;
- current bundle and deployment architecture; and
- Preact-based public-site and dashboard boundaries.

## Why web chat is the pilot

`interfaces/web-chat` already uses React 19 and maintains local implementations or wrappers for buttons, dialogs, menus, tooltips, command UI, scrolling, messages, and prompt composition. Astryx provides corresponding React 19 components plus a dedicated chat family:

- `ChatLayout`
- `ChatMessageList`
- `ChatMessage`
- `ChatMessageBubble`
- `ChatComposer`
- `ChatToolCalls`
- `Dialog` / `AlertDialog`
- `Button`, `Tooltip`, `DropdownMenu`, and related primitives

The pilot can therefore test Astryx's distinctive chat and accessibility behavior rather than evaluating it only as another button library.

## Repository boundaries

### In scope

- `interfaces/web-chat`
- a local Astryx-to-console theme bridge
- isolated replacement of web-chat UI primitives
- build, bundle, accessibility, and interaction validation

### Conditionally in scope after the pilot

- `plugins/cms`
- a shared React-only console adapter, but only after both web chat and CMS demonstrably need the same integration

### Out of scope

- `shared/ui-library`, which is Preact-based and used by SSR/static site templates
- `plugins/dashboard`, which is Preact server-rendered
- public site packages and themes
- replacing `@brains/console-theme`
- replacing Streamdown, Shiki, Mermaid, math rendering, or AI SDK ownership
- swizzling Astryx source into the repository during the pilot
- adopting Astryx's StyleX source-build pipeline

## Known constraints and risks

- Astryx requires React and ReactDOM 19 plus `@stylexjs/stylex`.
- The open-source package is beta and has high release velocity.
- `0.1.5` shipped a production JSX-transform regression fixed by `0.1.6`, so upgrades require explicit review and validation.
- Prebuilt Astryx CSS includes the full component stylesheet rather than only imported component styles.
- Astryx's stock visual themes do not represent the Rizom console identity; a token bridge is required.
- Its composer, tool-call, and scrolling models may not map cleanly onto all Brain-specific AI SDK behavior.

The pilot must stop rather than swizzle or fork components if these constraints make the integration brittle.

## Technical approach

Use Astryx's prebuilt distribution. Do not add Babel, PostCSS, Vite, or StyleX source-build integration.

Pin these exact pilot dependencies in `interfaces/web-chat/package.json`:

```json
{
  "@astryxdesign/core": "0.1.6",
  "@astryxdesign/theme-neutral": "0.1.6",
  "@stylexjs/stylex": "0.19.0"
}
```

The neutral theme supplies defaults and an icon registry; a local CSS bridge overrides its semantic tokens with existing `--console-*` values.

Bun can load the published reset, core, and theme stylesheets through `with { type: "text" }`, which fits the existing server-rendered HTML shell in `interfaces/web-chat/src/chat-page.ts`. The existing React aliasing in `interfaces/web-chat/scripts/build-ui.ts` remains the single-React guard.

## Phase 1: integration foundation

1. Add the exact dependencies above.
2. Load Astryx's prebuilt reset, core, and neutral theme CSS in `interfaces/web-chat/src/chat-page.ts`.
3. Add a local integration directory:

   ```text
   interfaces/web-chat/ui-react/src/astryx/
   ├── ConsoleAstryxProvider.tsx
   └── console-astryx.css
   ```

4. Implement `ConsoleAstryxProvider`:
   - wrap the app in Astryx `Theme`;
   - observe `document.documentElement.dataset.climate`;
   - map `instrument` to Astryx dark mode;
   - map `paper` to Astryx light mode; and
   - keep climate changes live without introducing a shared browser store.
5. Bridge at least these token groups to `--console-*` variables:
   - body, surface, card, popover, and muted backgrounds;
   - primary, secondary, disabled, and accent text;
   - borders and overlays;
   - success, warning, and error states;
   - body, display/heading, and monospace typography;
   - accent and on-accent colors.
6. Confirm the unmodified web-chat UI still renders correctly under both climates.

### Phase 1 exit criteria

- no duplicate React runtime;
- no console warning about an unbuilt theme;
- no reset or cascade regression in existing web-chat CSS;
- climate changes update Astryx components without reload; and
- production Bun build succeeds without a new build plugin.

## Phase 2: isolated component pilot

Replace only session-management interactions:

- rename session: Astryx `Dialog`, `TextInput`, and `Button`;
- archive session: Astryx `AlertDialog`;
- delete session: Astryx `AlertDialog` with destructive styling;
- related loading/help behavior: Astryx `Spinner` and `Tooltip` where useful.

Keep session state, TanStack Query ownership, mutations, URL state, and cache invalidation unchanged.

### Phase 2 validation

Verify:

- Escape closes the active dialog;
- focus is trapped while open and restored on close;
- Enter submits rename exactly once;
- destructive actions retain explicit confirmation;
- pending mutations disable repeated submission;
- error content remains visible and announced;
- dialogs fit phone safe areas; and
- all existing session tests remain green.

### Phase 2 decision gate

Stop the pilot if any of the following is true:

- matching the console identity requires component source swizzling;
- the token bridge becomes component-specific rather than semantic;
- focus management conflicts with the console strip or session drawer;
- the dependency and CSS cost is disproportionate to the removed code; or
- Astryx's beta API requires wrappers that simply recreate the current primitives.

## Phase 3: chat layout pilot

Proceed only after Phase 2 passes.

1. Replace the presentational conversation shell with `ChatLayout`.
2. Replace the message container with `ChatMessageList`.
3. Map AI SDK roles to `ChatMessage` senders.
4. Wrap the existing Streamdown response in `ChatMessageBubble variant="ghost"`.
5. Keep existing Brain-specific renderers for:
   - tool results;
   - approval requests and confirmations;
   - progress events;
   - sources;
   - actions;
   - generated attachments; and
   - uploaded files.
6. Keep the current `PromptInput` as the `ChatLayout` composer during this phase.
7. Compare Astryx stream scrolling with `use-stick-to-bottom` under:
   - initial history restoration;
   - active token streaming;
   - user scroll-away;
   - new-message indication;
   - session switching; and
   - short and long conversations.

### Phase 3 exit criteria

- no scroll jump when streaming begins or ends;
- user scroll position is respected;
- history restoration does not animate through old messages;
- `aria-live` behavior does not repeatedly announce partial tokens;
- mobile layout and safe-area behavior remain correct; and
- existing message-part renderers require no Astryx-specific domain changes.

## Phase 4: composer evaluation

Proceed only if the layout pilot is clearly better than the existing conversation shell.

Adapt existing prompt behavior to `ChatComposer` while preserving:

- controlled text state;
- submit and stop actions;
- file selection and upload preparation;
- attachment removal;
- upload notices and errors;
- disabled, submitted, and streaming states;
- keyboard submission; and
- mobile positioning.

Use Astryx composer slots for Brain-specific controls. Do not migrate if attachments or AI SDK state require invasive changes to Astryx internals.

## Phase 5: cleanup

Remove local primitives and dependencies only after all imports are gone and behavior is covered.

Candidates include:

- `radix-ui`
- `cmdk`
- `class-variance-authority`
- `tailwind-merge`
- `use-stick-to-bottom`
- superseded files under `interfaces/web-chat/ui-react/src/ui/`

Keep `lucide-react`, Streamdown, rendering plugins, and AI SDK dependencies where they still serve application behavior.

Add a changeset that describes the user-visible console change and record the exact Astryx version used.

## Validation

Run targeted package checks after each phase:

```bash
cd interfaces/web-chat
bun run typecheck
bun test
bun run lint
bun run build:ui
```

Then run the full Rover test app:

```bash
cd brains/rover
bun start:full
```

Verify `/chat` on desktop and phone-sized viewports in both paper and instrument climates. Exercise:

- create, rename, archive, delete, and switch session;
- initial history restore;
- streaming and stop;
- uploads;
- approvals;
- tool calls;
- sources and suggested actions;
- keyboard-only navigation; and
- reduced-motion behavior.

Record raw and compressed JS/CSS sizes before and after each phase. Confirm the bundle still contains one physical React runtime.

## Go/no-go criteria

Adopt Astryx in web chat only if:

- interaction and accessibility behavior is at least equivalent;
- the Rizom visual identity is preserved through semantic tokens;
- no component source is forked or swizzled;
- Brain-specific message logic stays independent of the design system;
- removed local code and dependencies justify the added runtime/CSS cost; and
- upgrades can remain explicit and package-local.

Reject or pause adoption if:

- the chat/composer abstractions fight AI SDK ownership;
- responsive or streaming behavior regresses;
- the theme bridge becomes fragile;
- beta release churn creates repeated migration work; or
- the pilot cannot remove meaningful custom code.

## Follow-up: CMS

If web chat passes the final gate, run a separate CMS pilot in `plugins/cms`, beginning with confirmation dialogs and schema-driven form controls. Keep CodeMirror, editor workflow state, Streamdown preview, TanStack Query ownership, and CMS-specific layouts unchanged initially.

Extract a shared React console adapter only after web chat and CMS have the same proven provider and token-bridge requirements. Until then, keep the integration local to avoid creating a speculative shared abstraction.

## Plan retirement

Delete this plan once one of these outcomes is captured in the changelog and relevant package documentation:

- Astryx is adopted with a documented version and upgrade boundary;
- the pilot is rejected with the existing UI retained; or
- a narrower successor plan replaces this evaluation.
