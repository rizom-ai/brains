# Live Brain demonstration — evidence, not page copy

Captured on **8 September 2026** for the Brain-page design review, before the artifact-led mockup revision. These are actual responses from the deployed Rizom Brain, not seeded conversations, invented customer work, or simulated results.

## The useful sequence

**An existing essay → a proposed workshop → a concrete critique.**

1. Rizom was asked to turn its public essay into a 30-minute workshop brief.
2. It returned a purpose, three discussion questions, and a timed agenda.
3. An isolated local Brain then called Rizom through its real `agent_call` tool, asking for a critique of that draft.
4. Rizom identified a mismatch: the draft encouraged individual reflection, while the essay argues for restructuring collective work. It proposed replacing the final exercise with a collective redesign lab.

That last suggestion is the useful change—not the fact that a protocol request completed. No revised workshop was generated, workshop held, or outcome tested.

## 1. Actual source material

**[The Future of Work is Play](https://rizom.ai/essays/the-future-of-work-is-play)** — Yeehaa, published 15 October 2025.

The essay describes play through voluntary engagement, participant-defined rules, freedom to fail, and the merger of learning and doing. It argues for collective coordination without control and ownership over employment.

These are the essay's ideas, not evidence that every economic structure it proposes is implemented in Rizom. Older ownership/equity language must not become a current product claim.

The public essay URL returned HTTP 200. Its URL was found in the actual [Writing index](https://rizom.ai/writing). See [source-check.json](source-check.json).

## 2. Actual generated artifact

Read the **[unedited workshop brief](workshop-brief.md)**.

- Direct public A2A request to the deployed Rizom Brain.
- The request asked it to retrieve the essay, produce the brief in its reply, and not save or publish content.
- The stream reported `completed` at `2026-09-08T08:04:48.441Z`.
- Task: `f25b3bb4-ae2d-4319-9507-491400a928b4`.
- The agenda totals 30 minutes and the response explicitly identifies the workshop as a proposal.

**Review issue:** the generated source URL was wrong. It used `/writing/the-future-of-work-is-play`, which returned 404. The correct path is `/essays/the-future-of-work-is-play`. The original response is preserved without silently correcting it.

**Retrieval boundary:** the response names the essay and is consistent with its themes, but this public stream does not expose a retrieval/tool trace. We can demonstrate a real response to the source-specific request; we cannot independently prove its internal retrieval steps from this capture.

Raw evidence: [request](draft-request.json), [complete response stream](draft-stream.txt), [public Agent Card snapshot](public-agent-card.json).

## 3. Actual runtime-to-runtime consultation

Read the **[unedited peer critique](peer-critique.md)**.

A separate local Brain was started using the canonical `bun run start:personal` posture script in an isolated worktree. An authenticated MCP client invoked that Brain's `agent_call` tool with `agent: "rizom.ai"`. The local runtime handled the outbound consultation; the assistant did not substitute a second direct HTTP call for it.

The request included the real draft and an explicit operator correction of the broken source URL. It asked for the single most important weakness and one concrete agenda change, without saving, publishing, or contacting further peers.

The returned result reports:

- `success: true`
- `state: "completed"`
- `agentCall.mode: "one-shot"`
- `agentCall.agent: "rizom.ai"`

Rizom proposed replacing the **20–27 minute “Experiment design”** segment with a **“Collective redesign lab.”** Participants would redesign a real collaboration challenge around voluntary participation, participant-defined rules, freedom to fail, and shared ownership.

Raw evidence: [operator-initiated tool request](peer-request.json), [MCP client's unwrapped tool response](peer-response.json). The response file preserves the client's returned JSON string rather than pretending to be a full HTTP or JSON-RPC packet capture.

### What this does and does not establish

- **Real:** a running local Brain used its actual outbound agent tool to obtain a live answer from a deployed peer.
- **Operator-initiated:** the operator selected Rizom and supplied the draft. The local model did not autonomously choose a peer, construct the request, or integrate the answer.
- **One-shot:** this was not a demonstrated saved/approved peer relationship or a verified signed-identity exchange.
- **Not two independent experts:** Rizom generated the first draft and also supplied the later critique. The other runtime was the local calling Brain.
- **No local-model proof:** the local AI endpoint was deliberately nonfunctional; no working local model credential was supplied. Remote Rizom performed the actual AI generation. Background local AI jobs consequently reported failures; this is not a general readiness or quality test of all Brain capabilities.
- **Not a completed collaboration outcome:** the suggested workshop change remains a proposal for human review.

## Capture and cleanup notes

An initial public `message/send` request was accepted as working, but an anonymous `tasks/get` poll returned “Task not found.” The handler restricts polling to callers with a matching verified domain. A fresh `message/stream` request was used to receive the completed public answer. The initial task's outcome is unknown; it is not presented as a failed generation.

The initial [request](initial-request.json), [acknowledgement](initial-acknowledgement.json), and [poll error](initial-poll-error.json) are retained so the successful stream is not presented as the only attempt.

The local setup also needed correction: the canonical script's stdio handshake did not complete in the capture harness, and an initial HTTP configuration used unsupported port keys. The completed capture used the real webserver `productionPort` setting, MCP authentication, and a successful readiness check on port 8397. Dependencies were installed in the isolated worktree with `bun install --frozen-lockfile`.

The demo app has been stopped. Its temporary tracked configuration changes were restored. No production site content was edited or published, no deployment was performed, and the Brain-page mockup was not redesigned during this evidence-gathering pass. The real A2A requests may leave their normal task/conversation records on the receiving service.
