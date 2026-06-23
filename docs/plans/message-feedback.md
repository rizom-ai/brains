# Plan: Message feedback events

## Status

Parked future plan. Do not implement until there is a real feedback sink/use case.

## Goal

Capture thumbs-up/thumbs-down style feedback from chat interfaces in a transport-neutral way, without baking Discord or web-chat UI details into shared runtime semantics.

Potential sinks/use cases:

- analytics events;
- eval review queues;
- response-quality dashboards;
- operator feedback reports;
- future conversation-level learning.

## Direction

Start with normalized feedback events, not conversation message metadata mutation.

A future shared feedback shape should include:

- conversation id;
- referenced assistant message id when available;
- feedback value such as `positive` or `negative`;
- whether the feedback was added or removed;
- actor/source attribution;
- raw transport metadata for auditing/debugging.

## Interface mapping

### Discord / Chat SDK

- Use Chat SDK reaction events.
- Map positive reactions such as 👍/✅ to `positive`.
- Map negative reactions such as 👎/❌ to `negative`.
- Preserve reaction removal so downstream sinks can neutralize prior feedback.
- Ignore bot/self reactions.
- Do not turn reactions into chat turns unless explicitly configured later.

### Web chat

- Add equivalent thumbs-up/thumbs-down controls to assistant messages.
- Send feedback to the backend using the same normalized feedback shape.
- Render feedback as UI state only unless a durable sink is selected.

## Shared/base escalation

- Add transport-neutral feedback event types/helpers in `shell/plugins/src/message-interface/`.
- Reuse shared actor/source attribution helpers.
- Add tests for normalization independent of Discord/web-chat.

## Non-goals

- Choosing a durable feedback store in this plan.
- Mutating conversation message metadata ad hoc.
- Feeding feedback directly into model context without a separate product decision.
