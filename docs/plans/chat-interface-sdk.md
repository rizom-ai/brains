# Plan: Multi-platform Chat Adapter Consolidation

## Status

Parked. This plan is the design record for a _later_ multi-platform chat adapter consolidation, to be revisited only when another chat surface (Slack, Teams, Matrix return path) gets prioritized. The web-first chat surface that previously appeared in this doc is out of scope here — it shipped via [brain-web-ui.md](./brain-web-ui.md) and is tracked there.

The previous hosted-Rover Discord gateway direction has been dropped. The "shared bot + central gateway + per-user routing" model added accidental complexity to solve a self-imposed constraint (one shared bot for all hosted users). The replacement model is: each Rover user brings their own Discord app token if they want Discord; each Relay team installs their own Discord app for their team's server.

## Original idea (recorded)

Wrap Vercel's Chat SDK as a single `ChatInterface` plugin that extends `MessageInterfacePlugin`. One plugin, one daemon, multiple platform adapters (Discord, Matrix, Slack, Teams, Telegram, etc.). The brain side owns behavior (permission lookup, conversation IDs, agent routing, confirmations, progress, file uploads, URL capture); the SDK owns platform plumbing.

The motivating goals were:

- avoid maintaining bespoke per-platform interface packages as more platforms get added;
- give Matrix a return path through a standard adapter rather than resurrecting `matrix-sdk-crypto-nodejs`;
- share message-handling code across platforms.

These goals remain valid, but they are not urgent. Today's brain ships `@brains/discord` directly on `MessageInterfacePlugin` and that works fine for the standalone/self-hosted case. Multi-platform demand is not the bottleneck — primary-UI parity in the browser is.

## Why this is parked

- **Discord stays on `@brains/discord`.** No migration off the existing package is planned. Bring-your-own-Discord-app for Rover and per-team install for Relay both work with the current package.
- **No urgent Slack/Teams demand.** When a new chat platform is actually prioritized, this plan's adapter architecture is the right starting point — but until then, building it speculatively just creates surface to maintain.
- **Web is its own surface, not a multi-platform adapter.** The bundled browser chat uses AI SDK UI streaming, not the Chat SDK platform-adapter model this plan describes. See [brain-web-ui.md](./brain-web-ui.md) for the active web surface and the distinction below.

## When to revisit

Reasons that would warrant reviving multi-platform consolidation:

1. A team explicitly needs Slack or Teams support for Relay deployments.
2. Matrix becomes a priority for federation/identity reasons.
3. A second non-web platform adapter is built and proves duplication with `@brains/discord` painful enough to consolidate.

Until one of those triggers fires, this plan stays parked.

## Relationship to other plans

- [brain-web-ui.md](./brain-web-ui.md) — active. Web chat surface bundled with `@rizom/brain`; prefers Vercel **AI SDK UI** / stream protocol for browser chat. That is distinct from this plan's Vercel **Chat SDK** platform-adapter consolidation.
- Relay's per-team Discord install model and shared-space trust resolver are independent of this plan.

## Decisions made before parking

For the record, the implementation slice that was confirmed (and is no longer planned) was:

- build `interfaces/chat/` first as an SDK-backed Discord adapter at parity with `@brains/discord`;
- use Chat SDK's in-memory state initially, defer durable state;
- run a daemon loop around Discord adapter's bounded `startGatewayListener(...)`;
- platform `interfaceType` values stay platform-specific (`"discord"`, `"matrix"`, etc.), not `"chat"`, to preserve permission rules.

If this plan revives, those decisions remain reasonable starting points.
