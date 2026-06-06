# Plan: Rover Chat-Native Onboarding

## Status

Proposed. This plan defines the product and implementation shape for Rover onboarding that happens inside the existing anchor-only web chat surface. It complements [Brain web chat surface](./brain-web-ui.md), which owns the shipped `/chat` interface, and is separate from [Passkey Operator Onboarding](./passkey-operator-onboarding.md), which owns first-passkey bootstrap and operator authentication.

## Context

Rover onboarding should teach the operator how Rover works by doing real work in chat. It is not only an intake form for profile/site fields.

The desired experience is a guided apprenticeship:

- Rover explains the knowledge + publishing brain model.
- Rover helps configure identity and site context where needed.
- Rover captures a first durable knowledge seed.
- Rover demonstrates retrieval and reuse of that knowledge.
- Rover offers a first transformation into publishable output.

The chat surface already provides the right primary interaction loop: operator-only access, conversation persistence, tool execution, confirmations, uploads, progress events, and structured artifacts. Onboarding should build on that rather than introduce a separate wizard route.

## Goals

1. Run Rover onboarding inside web chat as an agent-led conversation.
2. Keep the flow structured enough to be reliable and testable.
3. Teach capabilities through hands-on missions, not static documentation.
4. Reuse existing entity tools and plugins for durable content creation/update.
5. Persist onboarding progress outside synced `brain-data` as runtime state.
6. Make the implementation reusable enough for other brain models, while Rover supplies its own mission configuration.

## Non-goals

- Do not build a separate `/onboarding` wizard for MVP.
- Do not make onboarding own durable content entity types.
- Do not duplicate `system_create`, `system_update`, CMS, profile, note, post, or site-info responsibilities.
- Do not auto-publish content during onboarding.
- Do not make public visitor chat part of this work.
- Do not merge this with passkey setup; passkey setup remains an authentication/bootstrap concern.

## Product shape

Onboarding is a sequence of chat-native missions. Each mission has both a setup outcome and a teaching outcome.

```ts
interface OnboardingMission {
  id: string;
  title: string;
  setupGoal: string;
  teachingGoal: string;
  agentBehavior: string[];
  completionCriteria: string[];
}
```

The plugin supplies the mission map. The agent handles the natural conversation.

The flow should not feel like:

```text
Please enter your audience.
```

It should feel like:

```text
Tell me one idea you have been circling lately. I will save it as a note, then show you how Rover can reuse it.
```

## Rover MVP missions

### 1. Welcome and orientation

Purpose: explain what Rover is and set expectations.

Agent behavior:

- Briefly explain Rover as a personal knowledge and publishing brain.
- Explain that chat is the main control surface.
- Tell the operator that Rover can save, retrieve, connect, transform, and publish knowledge.
- Ask whether to start the guided setup.

Completion criteria:

- Operator starts, skips, or explicitly postpones onboarding.

### 2. Identity setup

Purpose: configure who Rover represents.

Agent behavior:

- Ask one question at a time about the operator's name, role, audience, expertise, and desired tone.
- Summarize before saving.
- Use existing entity tools to create or update the anchor profile when enough information is available.
- Explain that Rover uses this profile to shape answers, site content, and publishing workflows.

Completion criteria:

- `anchor-profile` is created or updated, or the operator explicitly skips this mission.

### 3. First knowledge seed

Purpose: show how knowledge enters Rover.

Agent behavior:

- Ask for one rough idea, note, link, or fragment the operator wants Rover to remember.
- Save it as an appropriate durable entity, usually a note or link.
- Explain that it is now part of the brain and can be retrieved, connected, summarized, or repurposed later.

Completion criteria:

- A note/link is created or an existing seed entity is identified.

### 4. Retrieval demonstration

Purpose: prove that saved knowledge becomes usable context.

Agent behavior:

- Invite the operator to ask about the saved knowledge, or offer to demonstrate.
- Retrieve or reference the created entity through normal agent/tool behavior.
- Explain the flywheel: more stored knowledge makes future answers and drafts more useful.

Completion criteria:

- Rover answers using the saved seed or explicitly demonstrates that it can find/reference it.

### 5. Transformation demonstration

Purpose: show the path from raw knowledge to publishable output.

Agent behavior:

- Offer two or three transformations, such as blog outline, social draft, newsletter idea, topic suggestions, or project angle.
- Create a draft only after the operator chooses one.
- Explain that Rover can help move from private thinking to public output without leaving the brain.

Completion criteria:

- A transformation is shown in chat, or an optional draft entity is created.

### 6. Wrap-up and next actions

Purpose: leave the operator with useful habits.

Agent behavior:

- Mark onboarding complete.
- Give a short list of example prompts for normal use.
- Mention where the operator can manage content, site, and settings.

Completion criteria:

- Onboarding state is marked complete.

## Load-bearing decisions

1. **Hybrid structure.** Missions are predefined; wording and follow-ups are agent-led.
2. **Plugin owns state, not content.** Onboarding stores runtime progress, answers, and created-entity references; durable content remains normal brain entities.
3. **No static script as source of truth.** Copy examples may guide the agent, but completion is based on state and tool outcomes.
4. **Web-chat first.** MVP starts in `interfaces/web-chat`; other interfaces can use the same tools/instructions later.
5. **Anchor-only.** Onboarding requires operator permission because it can create/update private and public content.
6. **Explicit starts.** The empty chat should show an onboarding invitation with a button, not auto-send a model message on page load.
7. **Passkey remains separate.** Auth bootstrap may lead the operator to chat after login, but this plan does not change setup-token delivery.

## Technical architecture

Add a generic service plugin:

```text
plugins/onboarding/
  src/index.ts
  src/plugin.ts
  src/state-store.ts
  test/plugin.test.ts
```

Package name:

```text
@brains/onboarding
```

The plugin registers:

- mission config schema;
- runtime state store;
- anchor-visible onboarding tools;
- agent instructions;
- optional chat bootstrap message handler.

Rover enables and configures the plugin in `brains/rover/src/index.ts`.

## Runtime state

Store state outside synced content, for example:

```text
./data/onboarding/state.json
```

Example shape:

```ts
interface OnboardingState {
  status: "not-started" | "active" | "completed" | "dismissed";
  currentMissionId?: string;
  completedMissionIds: string[];
  skippedMissionIds: string[];
  answers: Record<string, Record<string, unknown>>;
  createdEntities: Array<{
    missionId: string;
    entityType: string;
    entityId: string;
  }>;
  updatedAt: string;
}
```

This state is operational runtime state, not markdown knowledge.

## Tools

Register anchor-only tools with narrow responsibilities:

```text
onboarding_status
onboarding_start
onboarding_save_answer
onboarding_record_entity
onboarding_complete_mission
onboarding_skip_mission
onboarding_dismiss
onboarding_reset
```

Tool behavior:

- `onboarding_status` returns current mission, completed/skipped missions, known answers, created-entity references, and mission definitions.
- `onboarding_save_answer` stores transient setup answers that are not yet durable entities.
- `onboarding_record_entity` links a mission to an entity created/updated through normal entity tools.
- `onboarding_complete_mission` advances to the next mission.
- `onboarding_skip_mission` records an explicit skip and advances.
- `onboarding_dismiss` hides onboarding without deleting progress.
- `onboarding_reset` restarts onboarding for testing or operator-requested reruns.

## Agent instructions

The plugin should register concise but load-bearing instructions:

```text
When onboarding is active in web-chat, guide the operator through onboarding missions.
Use onboarding_status before deciding what to do next.
Do not behave like a form. Ask one question at a time.
Teach Rover by doing real actions with existing tools.
After each mission, explain what Rover just did and why it matters.
Use existing entity tools for durable profile, site, notes, links, posts, projects, newsletters, and social drafts.
Call onboarding_complete_mission only after the mission outcome is achieved or explicitly skipped.
Do not publish content during onboarding unless the operator explicitly asks and confirms the publishing action.
```

The mission config can add Rover-specific behavior, but the generic rules should live with the plugin.

## Web-chat integration

Add a bootstrap API route or message-bus request that web-chat can call when rendering an empty conversation.

Possible endpoint:

```text
GET /api/chat/bootstrap
```

Response:

```json
{
  "onboarding": {
    "active": true,
    "status": "not-started",
    "starterText": "Start Rover onboarding"
  }
}
```

Frontend behavior:

- If the conversation has no messages and onboarding is available, show an assistant-style onboarding invitation in the empty state.
- The primary button sends `Start Rover onboarding` as a normal user message.
- Do not auto-send on page load.
- If onboarding is dismissed or completed, fall back to the normal empty state.

This keeps the actual conversation in the same persisted chat transcript as normal use.

## Rover integration

In `brains/rover/src/index.ts`:

- import `onboardingPlugin` from `@brains/onboarding`;
- add `"onboarding"` to the `core` preset;
- add the plugin capability with Rover mission config.

Example:

```ts
[
  "onboarding",
  onboardingPlugin,
  {
    missions: [
      {
        id: "welcome",
        title: "Welcome to Rover",
        setupGoal: "Start the guided onboarding conversation.",
        teachingGoal: "Explain Rover as a knowledge and publishing brain.",
      },
      {
        id: "identity",
        title: "Set identity",
        setupGoal: "Create or update the anchor profile.",
        teachingGoal:
          "Show how Rover uses identity to shape answers and publishing.",
      },
    ],
  },
];
```

The final config should include the six MVP missions above.

## Phased implementation

### Phase 1 — Plugin foundation

- Create `@brains/onboarding` service plugin.
- Add config schema for missions.
- Add runtime JSON state store.
- Register onboarding tools.
- Register base agent instructions.
- Add plugin tests for state transitions and tool responses.

### Phase 2 — Rover configuration

- Add onboarding dependency to Rover.
- Add plugin to the `core` preset.
- Configure the Rover MVP missions.
- Add typecheck coverage.

### Phase 3 — Web-chat bootstrap

- Add backend bootstrap route or message-bus request.
- Add empty-state invitation in `interfaces/web-chat/ui-react/src/App.tsx`.
- Send the starter as a normal user message when the operator clicks the button.
- Preserve existing empty state when onboarding is complete/dismissed/unavailable.

### Phase 4 — Evaluation and polish

- Add a targeted eval or fixture conversation for onboarding behavior.
- Verify the agent asks one question at a time, saves a note/profile, demonstrates reuse, and completes missions.
- Add minimal docs or release notes after behavior is validated.

## Validation

- Run targeted onboarding plugin tests.
- Run `bun run typecheck` for `plugins/onboarding`, `interfaces/web-chat`, and `brains/rover` as applicable.
- Run web-chat UI build if frontend files change.
- Run Rover test app smoke check with `cd brains/rover && bun start:full` when validating the full chat flow.
- For docs-only edits to this plan, no code checks are required beyond markdown/link checks when links change.

## Open questions

1. Should onboarding be enabled for all Rover presets, or only `default` and `full`?
2. Should `site-info` setup be part of MVP, or defer until after identity and first knowledge seed?
3. Should the plugin expose a dashboard progress widget in a later phase, or keep MVP chat-only?
4. Should onboarding state later move from JSON files to the proposed operator/runtime database?
