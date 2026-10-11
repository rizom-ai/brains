# Plan: the Ask answers across brains over A2A

## Status

Proposed. Upstream design recorded 2026-10-09; this documentation batch does not implement or enable it. The ATProto index stays as it is; the proposal adds a live lane beside it. New privileged SDK authority, guest tool admission, spending policy, fleet changes, publication and paid live acceptance require separate review and explicit authorization. Existing per-deployment admission settings remain unchanged.

## Goal

A question put to Rizom on rizom.ai/ask could be answered by approved, public-eligible peers, not only by Rizom's own content and indexed pieces. Rizom would ask selected peers over A2A while the guest waits, merge their answers, cite by brain, and light the brains that answered. Package availability alone does not prove that a deployed peer enables inbound A2A or can answer; current fleet availability and directory contents must be verified separately.

## Baseline on this branch

- **Two lanes, by design.** [identity-and-trust.md](./identity-and-trust.md) assigns A2A to directed, signed calls between peers (domain identity, RFC 9421) and ATProto to ambient publishing (DID). `entities/agent-discovery/src/lib/network-pieces-sync.ts` reads approved agents' ATProto repositories and keeps published records as `network-piece` entities, which a guest's scoped `system_search` can find. No fresh fleet inventory or live-provider acceptance is claimed here.
- **Inbound A2A is opt-in.** The declarative interface in `interfaces/a2a/src/index.ts` mounts inbound routes only when `inbound` is enabled; `interfaces/a2a/src/config.ts` defaults it to false. `resolveCaller` in `interfaces/a2a/src/server.ts` treats unsigned requests as public, verifies supplied signatures and applies recorded trust; invalid signatures are refused. Public permission is not a spending allowance. `jsonrpc-handler.ts` executes A2A turns, while the existing guest execution policy applies to guest turns, not automatically to inbound A2A.
- **Outbound calls currently return text.** `executeAgentCall` and `parseA2AResponse` in `interfaces/a2a/src/client.ts` do not return task source artifacts. The declarative `a2a_call` tool is trusted-only and classified as an external effect. Saved contacts must be approved and not archived; the trusted tool also permits a verified HTTPS one-shot call to an unsaved exact domain. That one-shot path is not proposed for guest network selection. Existing in-process Studio calls require saved agents and are not guest authority.
- **A source already knows its brain.** `SourceCitationSchema` in `shared/contracts/src/agent-response.ts` carries citation identity, source, URL, entity identity, excerpt, provenance and optional `brain { name, url }`. The Ask box forwards brain attribution in `ask:sources`. The page-side foundation exists, but remote artifact validation and rendered attribution still need tests.
- **Skills are in the directory.** Agent records carry skills from their cards; local `skill-projection` produces skill data from published work. Selection must retain visibility/publication floors rather than borrowing the trusted caller's unrestricted directory reads.
- **The guest turn** (`shell/ai-service/src/guest-execution.ts`) currently allows `system_search`, `system_get` and `system_list`, and builds sources from tool results. This plan does not change that allowlist.

## Proposed decisions and review gates

1. **The network is asked live through a narrowly reviewed tool.** A proposed `network_ask`, owned by the declarative agent-discovery service, takes the question, selects peers and returns attributed answers. The guest agent could choose it alongside local search, without a second agent or separate pipeline. Remote calls are external effects and may incur provider usage; read-only content does not make them side-effect-free. Any required cross-package operation must preserve caller authority, cancellation and callback lifetimes through a narrow declared contract. Do not restore native bridges, expose raw services, or reuse a trusted-only operation with guest credentials. Review any new privileged capability before implementing it.
2. **Peers are chosen, not broadcast.** Candidates must be saved, approved, public-eligible agents with verified cards. Proposed selection matches skills/tags, asks at most three above a minimum score, and falls back to at most two eligible proximity neighbors. Archived, discovered-only and private contacts are excluded. Recheck eligibility before network contact; do not widen reader scope to fill a shortlist.
3. **Calls have explicit operational limits, not an inferred spending guarantee.** The initial proposal is parallel calls with a six-second per-call deadline and one attempt. Cancellation must cover card lookup, request and stream handling; settle or cancel outstanding work before the tool returns. Record answered, refused, failed and timed-out peers distinctly. Do not claim the tool finishes before outstanding deadlines merely because another peer answered. Peer/attempt limits and caller-side timeouts do not cap remote provider spend or prove that remote work stopped.
4. **A peer's answer carries validated sources.** Inbound A2A could add the turn's public-eligible sources as a task artifact; the client would parse validated artifacts into `A2AResult.sources`. Bound artifact counts and sizes and treat remote text, URLs and metadata as untrusted data, not instructions or permissions. A response without usable sources may be attributed to the answering brain, but is not proof of a specific cited document's eligibility.
5. **Citations keep verified attribution.** Return each peer answer as an attributed context item and retain eligible source attribution through `buildToolSourcesCard`. Bind attribution to the contacted, verified peer rather than trusting an arbitrary claimed brain. Local citations keep their original identity and publication floors; no private peer source may be promoted to a public citation. Test indexed/live source deduplication and which brain the room lights.
6. **Admission and accounting precede guest exposure.** Review an explicit inbound allowance, global and per-caller limits, durable accounting and a reachable kill switch before opening the live lane. Only verified signatures establish a caller domain; unsigned traffic needs a separately reviewed host-derived accounting identity, not a caller-supplied domain. Concurrent reservations, settlement, restart recovery, unknown usage and refusal semantics need tests. Missing usage remains unknown, not zero; a configured micro-USD threshold alone is not proof of a hard spending cap. Trusted permission is not an exemption from reviewed spending controls. Do not silently enable public asks or change existing deployment defaults.
7. **Fleet rollout is separate.** A2A's presence in a bundle does not enable inbound routes. Each deployment needs reviewed configuration, eligible directory entries, limits and an explicit enablement decision. Releases, fleet pins and paid live questions are not authorized by this plan.
8. **ATProto stays.** Indexed published pieces remain searchable. The two lanes would contribute to the same sources card without changing ownership or publication rules.

## Slices

One reviewed PR per slice, tests first. Supporting contracts can ship disabled; do not expose guest calls before the admission/accounting gate is satisfied.

### 1. A peer's answer carries its sources

Add public-eligible task artifacts to inbound responses and bounded, validated source parsing to the outbound client. Test tasks with valid, missing and malformed artifacts, forged attribution, withdrawn/restricted sources, and cancellation. Preserve declarative interface ownership and existing coded public-error/local-cause boundaries.

### 2. Rizom asks the network, disabled until admission is ready

Implement selection against fixture directories and calls against fake peers that answer, refuse, fail and hang. Establish the narrow declared cross-package contract before guest admission; the existing trusted Studio operation is not that contract. Verify attribution in a canonical local test app with a second local peer and injected turns, without a paid provider. Start the app through its posture script and rebuild through the running app before inspecting generated site output. Do not claim the Ask lights work until the served result is observed.

### 3. Admission, accounting and separately authorized rollout

Review and implement configuration, atomic admission/accounting where required, identity attribution, refusal responses and the kill switch. Test concurrency, cancellation, failure, unknown usage and restart recovery, then verify a disabled-by-default deployment. Only a separately authorized release, fleet configuration/pin change and paid live acceptance may follow; none is a prerequisite for accepting this documentation.
