# Plan: Message-interface semantic tool status

Proposed. This should be implemented in a separate worktree branched from local `main`, then merged into the Discord Chat SDK branch before replacing `@brains/discord`.

## Goal

Move tool-status lifecycle semantics into the shared message-interface layer while keeping rendering interface-specific.

The immediate symptom is Discord showing fallback-style messages such as:

- `⏳ **system create** running…`
- `✅ **system create** completed.`
- `⏸️ **system create** awaiting approval.`

Those strings are currently generated in `interfaces/chat`, but the lifecycle decision they encode is not Discord-specific. Web chat already consumes structured tool activity data parts, and future Slack/Chat SDK adapters will need the same semantics with different rendering.

## Design principle

Separate **semantic status derivation** from **transport rendering**.

Shared/base layer owns:

- mapping raw tool lifecycle events into semantic status updates;
- delaying `tool:completed` until the agent response is known when needed;
- resolving `tool:completed` as either `completed` or `awaiting-approval` based on pending confirmations;
- clearing failed/completed pending state consistently.

Interfaces own:

- Discord SDK cards/components;
- web-chat data parts;
- CLI/plain-text fallbacks;
- future Slack/Teams adapter-specific rendering.

Do not put Discord embeds/buttons/cards in the base class.

## Proposed shared model

Add a shared status type under `shell/plugins/src/message-interface/`, exported from `@brains/plugins`:

```ts
export type ToolStatusState =
  | "running"
  | "completed"
  | "awaiting-approval"
  | "failed";

export interface ToolStatusUpdate {
  state: ToolStatusState;
  toolName: string;
  conversationId: string;
  interfaceType: string;
  channelId?: string;
  channelName?: string;
  error?: string;
}
```

Exact naming can change during implementation, but the model should be transport-neutral and should not expose rendered strings as the primary contract.

## Base class changes

In `MessageInterfacePlugin`:

1. Track `tool:invoking` as `running` and call an override such as:
   ```ts
   protected handleToolStatusUpdate(update: ToolStatusUpdate): Promise<void>;
   ```
2. Store `tool:completed` events temporarily when the final state depends on the next agent response.
3. After an agent response is available, resolve stored completions:
   - if a pending confirmation exists for that tool, emit `awaiting-approval`;
   - otherwise emit `completed`.
4. Emit `failed` immediately for `tool:failed` and clear matching pending completion state.
5. Keep default implementation as no-op or plain fallback, depending on existing interface expectations.

## Interface changes

### `interfaces/web-chat`

- Replace local raw `ToolActivityEvent -> data-status` conversion with the shared `ToolStatusUpdate`.
- Continue streaming `data-status` parts.
- Support `awaiting-approval` if not already rendered via approval cards, without showing contradictory `completed` state.

### `interfaces/chat` Discord path

- Remove Discord-local completed-tool deferral logic.
- Render `ToolStatusUpdate` using Chat SDK cards/components or suppress redundant statuses:
  - `running`: compact transient status card.
  - `awaiting-approval`: preferably suppress if an approval card is also sent, or edit status to a non-emoji card.
  - `completed`: suppress when an artifact/confirmation result already communicates completion; otherwise compact status card.
  - `failed`: error status card.
- Keep text fallback only where SDK card rendering is unavailable.

## Non-goals

- Do not redesign job progress events in this slice.
- Do not move artifact/approval card rendering into the base class.
- Do not add Slack support here.
- Do not change tool execution semantics or confirmation policy.

## Suggested worktree

From local `main`:

```sh
cd /home/yeehaa/Documents/brains
git worktree add ../brains-worktrees/message-interface-tool-status -b feat/message-interface-tool-status main
```

After the shared base/web-chat work is validated, merge it into `feat/chat-interface` and replace the Discord-local status workaround there.

## Validation

Targeted tests first:

- base message-interface tests for semantic status derivation;
- web-chat tests for `data-status` output, including `awaiting-approval`;
- chat/Discord tests for native status rendering/suppression;
- regression: approval-requested `system_create` never emits a visible `completed` status before confirmation.

Checks:

```sh
bun test shell/plugins/test/message-interface
bun test interfaces/web-chat/test/web-chat-interface.test.ts
bun test interfaces/chat/test/chat-interface.test.ts
bun run --filter @brains/plugins typecheck
bun run --filter @brains/web-chat typecheck
bun run --filter @brains/chat typecheck
bun run --filter @brains/web-chat lint
bun run --filter @brains/chat lint
```

Run broader checks if shared type exports or base plugin behavior affect additional packages.
