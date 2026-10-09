# Plan: the Ask answers across brains over A2A

## Status

Decided 2026-10-09. Nothing of it is on `main` yet. The ATProto index stays as it is; this plan adds the live lane beside it.

## Goal

A question put to Rizom on rizom.ai/ask is answered by the brains that know, not only by Rizom's own content and the pieces it has indexed. Rizom asks the right peers over A2A while the guest waits, merges what they answer, cites by brain, and the room lights the brains that answered. Every brain in the fleet can be asked today: A2A is in the core bundle, inbound calls are public by default, and Rizom's directory already holds the fleet's brains as approved.

## Baseline

- **Two lanes, by design.** [identity-and-trust.md](./identity-and-trust.md) assigns A2A to directed, signed calls between peers (domain identity, RFC 9421) and ATProto to ambient publishing (DID). The Ask so far uses only the second: `network-pieces-sync` in `entities/agent-discovery` reads each approved agent's ATProto repository and keeps the records as `network-piece` entities, which the guest's `system_search` finds like any public entity. Only rizom-ai carries the federation bundle and a PDS identity; in rizom-ai's directory one agent of fourteen has a repository (yeehaa.io), and all 33 indexed pieces are its.
- **Inbound A2A is public by default.** `resolveCaller` in `interfaces/a2a/src/a2a-interface.ts` serves an unsigned call, or a signed call from a domain without a trust grant, at the public permission level. A trust grant only raises a caller above public. `message/send` in `jsonrpc-handler.ts` runs the brain's agent as `interfaceType: "a2a"`. There is no per-caller allowance on that path; the guest execution policy (`shared/contracts/src/guest-execution.ts`: character and time limits, `maxCostMicroUsd`) applies to the guest interface only.
- **Outbound calls drop sources.** `executeAgentCall` and `parseA2AResponse` in `interfaces/a2a/src/client.ts` return the peer's text parts only; a task's artifacts are not read. `a2a_call` refuses a peer that is not approved in the caller's own directory.
- **A source already knows its brain.** `SourceCitationSchema` (`@brains/contracts`) carries `id`, `title`, `source`, `url`, `entityType`, `entityId`, `excerpt`, `provenance` and `brain { name, url }`; the Ask box's `ask:sources` event forwards `{ id, title, brain }`, and the room lights a brain by its id, address or name. The page side needs nothing new.
- **Skills are in the directory.** An agent entity carries `skills` derived from its published work (`skill-deriver`, `skill-projection`), with a shared tag vocabulary.
- **The guest turn** (`shell/ai-service/src/guest-execution.ts`) allows three read tools (`system_search`, `system_get`, `system_list`) and builds its sources card from the tool results (`buildToolSourcesCard` in `agent-results.ts`).

## Decisions

1. **The network is asked live, as a tool the guest turn may use.** A new public, side-effect-free tool `network_ask` (owned by agent-discovery, admitted to the guest allowlist) takes the question, picks peers and returns their answers with sources. The agent decides when to use it, as it decides to search; the system prompt for guest turns says the network can be asked. No separate pipeline, no second agent.
2. **Peers are chosen, not broadcast.** Candidates are approved agents with a card. The question is matched against each agent's skills and tags; the three best, with a minimum score, are asked. With no match, the two nearest by proximity. Never more than three, never an agent that is archived or discovered-only.
3. **Each call has a budget.** Calls run in parallel over `executeAgentCall` with a per-call budget of 30 seconds and one attempt, and each peer is asked for a brief cited answer. A peer's answer is a model turn with retrieval, measured at 15–25 s on the fleet (docs.rizom.ai answered the setup question in 22 s), so a budget of a few seconds asks nobody in effect; the guest turn's own limit is 180 s. A slow, unreachable or refusing peer is dropped; the tool result names who answered and who did not, so the answer can say so. The whole tool waits for the slowest survivor, not for the budget.
4. **A peer's answer carries its sources.** The inbound turn adds a `sources` artifact to the task (`task-manager.addArtifact`, a `data` part carrying the turn's `SourcesCard`), and the client reads task artifacts into `A2AResult.sources`. A peer that returns no artifact still counts as an answer, cited as the brain itself.
5. **Citations keep the brain.** `network_ask` returns each peer's text as a context item attributed to the brain and each peer source with `brain { name, url }` set to the peer, so `buildToolSourcesCard` carries them and the room lights the brain. Rizom's own pieces keep their citation; a peer's indexed piece and its live answer cite the same brain.
6. **Being asked is bounded.** Inbound public A2A turns get an allowance mirroring the guest policy: per caller domain per day a message count and a cost cap in micro USD, a global daily cap, and a kill switch (`a2a.publicAsks.enabled`). Defaults are on and modest. A caller over its allowance gets a refusal message, not an error, so the asking brain drops it like a timeout. Trusted callers keep the trusted level's limits, which are the same numbers unless configured.
7. **Nothing changes in the fleet files.** A2A is in the core bundle and the asked brains need no trust grant to answer at public level. The feature reaches every brain through a brain release and a fleet bump. rizom-ai's directory already approves the fleet's brains; a new brain joins by being approved there.
8. **ATProto stays.** Indexed pieces remain in the search and keep answering for brains that publish. The two lanes merge in the same sources card.

## Slices

One PR per slice, each shippable on its own, tests first.

### 1. A peer's answer carries its sources

Inbound: the `a2a` turn's sources card becomes a task artifact. Outbound: `parseA2AResponse` and `executeAgentCall` return `sources: SourceCitation[]` from artifacts (empty when none). Tests: `interfaces/a2a` task and handler tests for the artifact; client tests for parsing a task with and without it.

### 2. Rizom asks the network

`network_ask` in agent-discovery: peer choice from skills and proximity (pure, tested on a fixture directory), the parallel calls with the per-call timeout (tested with fake peers that answer, refuse and hang), the result shape with attributed context items and brain-bearing sources. Admission to the guest tool allowlist and one line in the guest instructions. Verified on the local test app with a second local brain as the peer and an injected guest turn, never a paid message on rizom.ai; the lights on /ask come on for the peer.

### 3. Being asked is bounded

The inbound allowance for public A2A turns: configuration, counting in runtime state keyed by caller domain and day, the refusal message, the kill switch. Tests at the handler level. Then release, fleet bump through `pin:site`'s sibling, the brain version bump, and a live question on rizom.ai/ask whose answer lights a fleet brain.
