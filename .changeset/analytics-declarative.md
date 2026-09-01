---
"@brains/analytics": minor
"@brains/sdk": minor
---

Migrate `@brains/analytics` to the declarative surface. The plugin class is
deleted; the Cloudflare client is built in `setup`, the traffic-overview
insight moves to the `insights` slot, the beacon head-script send moves to
`ready`, and `analytics_query` becomes a `defineTool` declaration. Tool names
are unchanged.

Declared tools can opt out of the agent's tool set: `defineTool` accepts
`agentTool: false` for tools that exist for people over MCP, not for the
agent to reach for unprompted. The insight handler contract
(`EntityInsightContext`, `EntityInsightDeclaration`) is published type-only
on `@rizom/brain/services`.
