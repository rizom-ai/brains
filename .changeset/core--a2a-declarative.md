---
"@brains/a2a": minor
"@brains/plugins": minor
"@brains/sdk": minor
"@brains/agent-discovery": patch
"@brains/ai-service": patch
---

Migrate `@brains/a2a` to the declarative surface. The package is one `defineInterface` (`a2a`) importing `@brains/sdk`, `@brains/contracts`, `@brains/http-signatures` and `@brains/utils`; `A2AInterface` is deleted. The five shared-host routes, the call tool, the two Studio subscriptions, the agent instructions and the daemon are declared; the Agent Card is built on the first request rather than at ready, from the same reads.

**The call tool is `a2a_call`.** A tool is named after the interface that declares it, as `agents_connect`, `agents_scan-directories` and `agents_set-trust-level` already were after agent-discovery converted. The agent-discovery instructions and the shell's agent-contact follow-up text still said `agent_connect` and `agent_call`; both now name the tools that exist. The runtime plugin id is `@brains/a2a:a2a`; permission rules keyed `a2a:<domain>` are unchanged because the declaration id stays `a2a`.

The interface contract grows what a2a needed, each with `@brains/a2a` as the named consumer: `subscriptions` and `instructions` on plain interfaces (message interfaces already had the first); `identity`, `profileKinds`, `tools` and `publicSkills` on the setup context, the reads an Agent Card is built from; `listEntities` and `getEntityTypes` on the interface entity reader; and a filter plus `getEntityTypes` on the subscription reader. `@brains/sdk/interfaces` exports `ANCHOR_EXTENSION_URI`, `AnySubscriptionDefinition`, `PublicSkill`, `ResolvedProfileKind` and `ToolInfo`. The subscription registration loop that two interface families each wrote is one shared helper.

`describeBrain` is exported for a publisher that mirrors the Agent Card elsewhere; the legacy `trustedTokens` and `outboundTokens` config keys are now refused by the strict config schema rather than by a constructor check.
