# Plan: Insights from team channels

Last updated: 2026-11-28

## Status

Built, not yet tried. In a configured chat space the channel pickup (`entities/conversation-memory/src/lib/channel-pickup`) turns new messages into action items and decisions, and into insights when a brain sets `captureInsights`. The setting is off by default. What remains is a trial on the team brain and the decision it informs: whether insight capture becomes a default.

## The model

A conversation establishes three kinds of thing, each a claim with a source:

- an **action item**: someone committed to do something;
- a **decision**: the group settled something;
- an **insight**: the group learned or concluded something.

All three record the conversation they came from, the people involved, when it was said, and whether it still holds. The summary is not in this family. It restates what was said, which the conversation database already keeps, and it never had a unit that fit: per conversation it grows without end in a channel, and per day or per topic it serves one reader and fails another. Nothing writes summaries; stored ones stay readable.

## What is built

- **The type.** `insight` is a sibling of `decision` (`schemas/conversation-memory.ts`): the fields the two record about their source are defined once, and an insight names who stated it. It is recorded by hand through `system_create` at `shared` or `restricted` visibility, read into the agent's context from the same space, and listed on the Dashboard.
- **Capture.** With `captureInsights` on, the claim extractor (`claim-extractor.ts`) judges every statement that might be a decision or an insight as one of `decision`, `insight`, `guess`, `action-item`, `undecided` or `recorded`, and keeps the first two. With it off the prompt does not mention insights and reads as it did for decisions alone.
- **Ownership.** An insight the pickup wrote and nobody has edited may be superseded by a later finding, as a decision may; one a person has edited is never changed. Undo deletes only one that is still the pickup's own.
- **Evals.** Five insight cases (`evals/test-cases/channel-insight-*.yaml`) beside the nine for decisions: a conclusion reached over several messages, none for chatter or an unconfirmed guess, a decision stays a decision, a task stays a task, and a finding that overturns a recorded insight.

## The trial

1. Turn `captureInsights` on for the team brain, in its conversation-memory configuration.
2. Let it run for two weeks of ordinary use of the team's channels.
3. Review every insight it recorded, and every Undo, with the people in those channels.

The criterion is whether the captured insights are ones a team member would have saved. Three outcomes are possible: capture becomes the default, stays opt-in, or is removed, the type staying for insights recorded by hand.

What to look for:

- insights that restate a decision or an action item the same batch recorded;
- one finding recorded as two insights;
- guesses recorded as findings;
- findings the team relied on that were not recorded.

## Open questions

- **Stored summaries on disk.** A summary is read-only through the action tools, but directory sync imports an edited summary file whose body still parses. Whether sync should refuse changes to system-maintained types is undecided.
- **`decision-record` in `team-posture-capabilities.md`.** That parked item describes decision logs with rationale. Whether it is still a separate type now that decisions are picked up and recorded by hand is undecided.
