# Plan: Multi-platform Chat Adapter Consolidation

## Status

Parked. The web-first chat surface that motivated most of this plan now lives in [brain-web-ui.md](./brain-web-ui.md), which is the active near-term investment. This document remains as the design record for a _later_ multi-platform adapter consolidation, if and when another chat surface (Slack, Teams, Matrix return path) gets prioritized.

The previous hosted-Rover Discord gateway direction has been dropped. The "shared bot + central gateway + per-user routing" model added accidental complexity to solve a self-imposed constraint (one shared bot for all hosted users). The replacement model is: each Rover user brings their own Discord app token if they want Discord; each Relay team installs their own Discord app for their team's server.

## Original idea (recorded)

Wrap Vercel's Chat SDK as a single `ChatInterface` plugin that extends `MessageInterfacePlugin`. One plugin, one daemon, multiple platform adapters (Discord, Matrix, Slack, Teams, Telegram, etc.). The brain side owns behavior (permission lookup, conversation IDs, agent routing, confirmations, progress, file uploads, URL capture); the SDK owns platform plumbing.

The motivating goals were:

- avoid maintaining bespoke per-platform interface packages as more platforms get added;
- give Matrix a return path through a standard adapter rather than resurrecting `matrix-sdk-crypto-nodejs`;
- share message-handling code across platforms.

These goals remain valid, but they are not urgent. Today's brain ships `@brains/discord` directly on `MessageInterfacePlugin` and that works fine for the standalone/self-hosted case. Multi-platform demand is not the bottleneck — primary-UI parity in the browser is.

## Why this is now parked

- **Web is the primary UI focus.** [brain-web-ui.md](./brain-web-ui.md) builds a bundled browser chat surface so a new user can chat with their brain without any external platform setup. That closes the "try Rover" gap.
- **Discord stays on `@brains/discord`.** No migration off the existing package is planned for v0.2.0. Bring-your-own-Discord-app for Rover and per-team install for Relay both work with the current package.
- **No urgent Slack/Teams demand.** When a new chat platform is actually prioritized, this plan's adapter architecture is the right starting point — but until then, building it speculatively just creates surface to maintain.

## When to revisit

Reasons that would warrant reviving multi-platform consolidation:

1. A team explicitly needs Slack or Teams support for Relay deployments.
2. Matrix becomes a priority for federation/identity reasons.
3. The bundled web chat (per `brain-web-ui.md`) needs to share substantial chat-handling code with platform adapters in a way that proves duplication painful.

Until one of those triggers fires, this plan stays parked.

## Relationship to other plans

- [brain-web-ui.md](./brain-web-ui.md) — active. Web chat surface bundled with `@rizom/brain`; prefers Vercel **AI SDK UI** / stream protocol for browser chat. That is distinct from this plan's Vercel **Chat SDK** platform-adapter consolidation.
- [shared-space-trust.md](./shared-space-trust.md) — Relay's per-team Discord install model is independent of this plan.

## Decisions made before parking

For the record, the implementation slice that was confirmed (and is no longer planned) was:

- build `interfaces/chat/` first as an SDK-backed Discord adapter at parity with `@brains/discord`;
- use Chat SDK's in-memory state initially, defer durable state;
- run a daemon loop around Discord adapter's bounded `startGatewayListener(...)`;
- platform `interfaceType` values stay platform-specific (`"discord"`, `"matrix"`, etc.), not `"chat"`, to preserve permission rules.

If this plan revives, those decisions remain reasonable starting points.
