---
"@brains/agent-discovery": minor
"@rizom/site": patch
---

Migrate `@brains/agent-discovery` to the declarative surface — the eighteenth and last official package to come off plugin classes. Three plugin classes and both adapters are deleted; its tools become `defineTool` declarations and its two entity types plus the directory service become one `defineServicePlugin` package.

**Three MCP tools are renamed.** `agent_connect`, `agent_scan_directories` and `agent_set_trust_level` become `agents_connect`, `agents_scan-directories` and `agents_set-trust-level`. Declared tool names are hyphenated, and the service id had to go plural because it collided with the `agent` entity type. Anything calling them by name breaks.

**Site route template names take the package-scoped form.** `agent-discovery:agent-list` becomes `@brains/agent-discovery:agent:agent-list`, and likewise for `agent-detail` and `proximity-map`. `sites/rizom-ai` is updated; anything else referencing them is not.

Granting inbound A2A trust changed shape. The peer's key fingerprint used to be fetched before the confirmation and handed back through the caller, so the pinned key was whatever came back rather than whatever the domain publishes. It is fetched at grant time now, after the operator has agreed, and the confirmation no longer displays it.

Two defects surfaced during the conversion. A status change stopped reaching the file it is stored in — the adapter this replaced rebuilt frontmatter from metadata on every write, so an agent approved in the database still read as a sighting on disk. And a dropped admin guard let `trusted` callers approve agent contacts through the sightings inbox, which is a decision about who the brain will talk to.
