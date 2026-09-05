---
"@brains/plugins": minor
"@brains/core": minor
"@brains/sdk": minor
"@brains/agent-discovery": patch
"@brains/series": patch
---

A projection rule now declares whether it owns the entities it derives. `targets` is **required**: `exclusive` means the latest derivation is the whole truth and the runtime removes what it stopped mentioning, within a visibility the rule must name; `additive` means it writes and never removes. Every rule has to choose, so forgetting is no longer possible and "never deletes" becomes a statement rather than absent code.

This replaces a diff loop each rule wrote by hand. Two wrote one and they disagreed: `skill-projection` scoped its comparison set to a visibility, `series-projection` did not — so a public series derivation deleted `shared` series. That is fixed. The reconcile runs in the job handler against live target state rather than inside `derive`, because a memo hit replays cached intents and deletions baked into a derivation would be frozen against a target set that drifts independently of the input.

`derive` may return `PROJECTION_ABSTAINED`. An empty array means "none of these should exist"; abstaining means "I had nothing to derive from, leave my targets alone". Both shipped exclusive rules return early when their sources are empty — normal during initial sync — and without the distinction that reads as a mass deletion.

Rules can now derive from conversations. `{ kind: "conversation" }` is a source kind, the input context carries a narrow conversation reader, and the runtime polls conversations on a watermark because they live in their own database and cannot mark themselves dirty inside the write that changed them. A wildcard entity source (`types: ["*"]`) no longer matches a conversation change, which would otherwise have woken every such rule on every message.

`runProjectionRule` takes the sources an eval is simulating. Omitted, behaviour is unchanged; a rule that derives only from what changed needs them or it measures an abstention.

The mock entity service passes `options` through to `listEntities`, so a rule that filters by `visibilityScope` and one that forgets are no longer indistinguishable to tests.
