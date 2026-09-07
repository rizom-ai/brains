# Brain positioning audit

Read-only product investigation for the next `/brain` proposal. This is not approved website copy. The mockup is unchanged.

## Finding

I had framed Brain as a private memory tool. The product is better understood as **an owned, knowledge-grounded agent that can do work and represent a person, team, or organization across interfaces**.

Memory supports that agent. It is not the whole proposition. Publishing is a substantial implemented work capability, not merely an optional export button. Agent identity and agent-to-agent connectivity belong to the core definition, not an imagined final stage of a notes application.

The strongest positioning hypothesis supported by this investigation is:

> Turn what you know into an agent that works for you.
>
> Build an agent around your knowledge, give it the capabilities you need, and let people and other agents engage with your expertise—under your control.

This is a product-grounded hypothesis, not a claim of validated conversion performance.

## Positioning sources

- `rizom-content/BRAND.md`, July 2026 edition: explicitly leads with an agent grown from professional knowledge that answers, publishes, and represents its owner. Primary audience: independent experts; teams and organizations are also supported. It rejects the chatbot-wrapper and freelance-marketplace categories.
- The same brand book explicitly supersedes the 2025 `RizomBusinessBrief.md`. The old brief's Cores, algorithmic team formation, commercial splits, and outcome claims must not be treated as shipped capabilities.
- `rizom-content/brain-character/brain-character.md`: Rizom's role is "Knowledge and presence coordinator for the Rizom collective"; its purpose includes representing Rizom, not just remembering its notes.
- The approved living-memory homepage supplies the umbrella story. It does not justify reducing the product underneath it to conversation continuity.

## What the implementation establishes

| Finding                                                                                                                                                        | Evidence                                                                                                                                                                                                                                                                                                                              | Implication for the page                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The brain and its owner have separate identities. Character, purpose, values, Anchor profile, caller identity, and permissions are explicit runtime inputs.    | [Brain instructions](../../../shell/ai-service/src/brain-instructions.ts), [agent construction](../../../shell/ai-service/src/agent-service.ts)                                                                                                                                                                                       | "An agent that represents you" is more accurate than either a generic assistant or a digital clone pretending to be you.                                            |
| Identity, knowledge, MCP, A2A, and agent discovery are in core. Chat, web, site, publishing, and automation are separate selections.                           | [Canonical bundles](../../../packages/brain-cli/src/model/canonical-bundles.ts), [canonical catalog](../../../packages/brain-cli/src/model/canonical-brain.ts)                                                                                                                                                                        | Neither the chat window nor Studio is the product's defining boundary. A headless brain is still a brain.                                                           |
| The agent uses a permission-filtered tool loop and stops for tool-returned confirmations.                                                                      | [Brain agent](../../../shell/ai-service/src/brain-agent.ts), [agent service](../../../shell/ai-service/src/agent-service.ts)                                                                                                                                                                                                          | It can act through installed capabilities, not merely compose answers. Do not imply unrestricted autonomous execution.                                              |
| Content generation explicitly uses the represented Anchor and configured voice guidance.                                                                       | [Blog generation handler](../../../entities/blog/src/handlers/blogGenerationJobHandler.ts)                                                                                                                                                                                                                                            | Show the knowledge becoming useful output, not only a user manually editing markdown. "In your voice" is guidance, not a guarantee of indistinguishable authorship. |
| Publishing has generation schedules, conditions, queues, asset preparation, providers, and confirmation-aware commands.                                        | [Bundle defaults](../../../packages/brain-cli/src/model/bundle-policy.ts), [pipeline implementation](../../../plugins/content-pipeline/src/plugin.ts)                                                                                                                                                                                 | This is genuine production/distribution work. Available capabilities depend on configuration and integrations.                                                      |
| Authored playbooks have steps, completion conditions, transitions, and runtime evidence.                                                                       | [Playbooks implementation](../../../plugins/playbooks/src/plugin.ts), [first knowledge loop](../../../plugins/onboarding/content/playbook/first-knowledge-loop.md)                                                                                                                                                                    | The brain can guide bounded work. This is not proof that it can independently run any business process.                                                             |
| Team is a policy bundle over selected capabilities, with shared memory visibility and trusted collaborative writes.                                            | [Team policy](../../../packages/brain-cli/src/model/bundle-policy.ts), [team instance](../../../packages/brain-cli/test-apps/team/brain.yaml)                                                                                                                                                                                         | A shared team brain is real. Automatic merging of everyone's personal brains into one memory is not established by this implementation.                             |
| Agent calls, signed peer requests, reviewable second-order discovery, and opt-in Jetstream discovery are implemented.                                          | [A2A client](../../../interfaces/a2a/src/client.ts), [A2A interface](../../../interfaces/a2a/src/a2a-interface.ts), [directory scanning](../../../entities/agent-discovery/src/tools/agent-scan-directories.ts), [ATProto lifecycle](../../../plugins/atproto/src/plugin.ts), [configuration](../../../plugins/atproto/src/config.ts) | Networking is functional product infrastructure. It is not evidence of a mature talent marketplace or automatic work/team matching. Jetstream defaults off.         |
| Public skills can be derived from visibility-scoped knowledge topics. The current derivation infers capabilities from those topics, without tool descriptions. | [Skill derivation](../../../entities/agent-discovery/src/lib/skill-deriver.ts)                                                                                                                                                                                                                                                        | "Discoverable by what your knowledge concerns" has a technical basis. A generated skill card is not a credential or independently verified ability.                 |

## Boundaries that change the pitch

### Automatic memory is not a safe blanket promise

The [conversation-memory package](../../../entities/conversation-memory/README.md) explicitly states that automatic conversation-to-entity projection is disabled. Its [registration](../../../entities/conversation-memory/src/conversation-memory-plugin.ts) exposes existing summaries, decisions, action items, retrieval, and evaluation, without registering that automatic ingress.

This does not mean conversations cannot persist or existing memory cannot be retrieved. It means "every conversation automatically makes the brain's durable knowledge richer" is not supported. My proposed continuity story risked implying exactly that.

### Discovery maturity is bounded

[Agent discovery documentation](../../agent-discovery.md) now distinguishes shipped signed peer identity and the implemented-but-disabled Jetstream consumer from approved ambient discovery. Signed transport does not make an unknown card trusted, and current fleet configuration does not enable Jetstream.

The [public-release README](../../public-release/README.md) bounds the category: tool-using knowledge agents under user control, not a general-purpose autonomous-agent research framework. Scheduled and event-driven capabilities do not erase that boundary.

### Ownership is specific

The runtime is self-hosted and durable knowledge is portable markdown. That does not mean a configured external AI provider receives no data. Nor does owning the agent mean owning the underlying foundation model. Avoid "everything stays local" unless describing a verified local-provider configuration.

## Live evidence checked

A read-only GET of [Rizom's public Agent Card](https://rizom.ai/.well-known/agent-card.json) returned HTTP 200 and runtime version `0.2.0-alpha.360`.

It identifies Rizom as the collective's knowledge and presence coordinator, exposes an A2A endpoint, and advertises knowledge-domain skills including organizational design and open-software governance.

This confirms the deployed public identity and advertised protocol surface. It does not independently verify the quality of its answers or successful delivery of the advertised skills. No live AI request, publication, or peer connection was performed for this audit.

## Implication for the story

The original "Build the agent that represents you" was closer to the product than my "resume your project" rewrite.

A better story should establish:

1. **Your expertise currently depends too much on you being present to explain and apply it.** This is broader than lost context.
2. **Give that expertise an agent of its own.** Knowledge, identity, voice guidance, and useful capabilities—not a fictional digital copy of a person.
3. **Show it doing a real piece of work.** Retrieval plus generation or another installed action, with the useful output and appropriate review visible.
4. **Show how others can engage with it.** A public knowledge presence and a verified agent connection are different faces of the same brain, not decorations after the main story.
5. **Keep ownership and boundaries explicit.** Private material, shared team use, public presence, permissions, and chosen integrations.

The main proof should be a real brain—Rizom is the obvious candidate—seen through its work, public presence, and agent identity. A Studio screenshot demonstrates one interface. It cannot carry the entire argument by itself.

## Investigation scope

Inspected source revision: `2b7ecfe604`, compared with local `origin/main` at `d4ad45b46bbbb5260bec480764ef45a4754ca8f7`. Within the audited implementation paths, differences were release metadata and proximity-map presentation changes, not the behavioral findings above.

Focused checks passed: **31 tests, 0 failures**, covering A2A target resolution, Jetstream lifecycle, conversation-memory registration, and skill derivation. These are mocked/local checks, not an end-to-end production assessment.

No mockup, live content, application configuration, or deployment was changed by this investigation.
