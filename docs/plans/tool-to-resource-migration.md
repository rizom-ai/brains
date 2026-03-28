# Plan: Tool-to-Resource Migration

## Problem

Five system/plugin tools are read-only and duplicate data already available through MCP resources or the system prompt. They add noise to the tool surface the AI agent reasons about without enabling any action the agent can't already take.

Additionally, the agent's system prompt embeds identity but tells the agent to call `system_get-profile` for anchor data. Profile and site info should be embedded in the system prompt alongside identity — they're small, rarely change, and used frequently.

## Tools to remove

| Tool                          | Current behavior                   | Replacement                                            |
| ----------------------------- | ---------------------------------- | ------------------------------------------------------ |
| `system_get-identity`         | Returns brain character            | Already in system prompt + `brain://identity` resource |
| `system_get-profile`          | Returns anchor profile             | Embed in system prompt + `brain://profile` resource    |
| `system_get-status`           | Returns version, interfaces, tools | New `brain://status` resource                          |
| `site-builder_list_routes`    | Returns registered routes          | New `site://routes` resource                           |
| `site-builder_list_templates` | Returns view templates             | New `site://templates` resource                        |

## System prompt changes

Currently embedded: identity (name, role, purpose, values).
Currently fetched via tool: profile.
Not available without tool: site info.

After this change, the system prompt includes all three:

```
# Yeehaa's Rover

**Role:** Personal knowledge assistant
**Purpose:** Help organize and share knowledge
**Values:** clarity, accuracy

## Your Anchor
**Name:** Jan Hein
**Email:** jan@yeehaa.io
**Website:** https://yeehaa.io

## Your Site
**Title:** Yeehaa
**Domain:** yeehaa.io
**URL:** https://yeehaa.io
```

Site info section is conditional — only included if site-builder is registered.

### Prompt rebuild on change

The agent is created once per conversation. If identity, profile, or site info changes mid-session (via `system_update`), the system prompt is stale.

Fix: subscribe to `entity:updated` for `brain-character`, `anchor-profile`, and `site-info` entity types. On change, invalidate the cached agent so the next conversation gets fresh data. Mid-conversation changes won't be reflected (acceptable — these change rarely).

## Steps

### Phase 1: Embed profile and site info in system prompt

1. Update `buildInstructions()` in `shell/ai-service/src/brain-agent.ts` to accept profile and site info
2. Pass profile from `identityService.getProfile()` into agent config
3. Pass site info from entity service (if `site-info` entity exists) into agent config
4. Update `AgentService` to resolve profile and site info when creating agent
5. Remove instructions text referencing `system_get-identity` and `system_get-profile` tools
6. Tests

### Phase 2: Agent invalidation on entity changes

1. `AgentService` subscribes to `entity:updated` for `brain-character`, `anchor-profile`, `site-info`
2. On update, set `this.agent = null` so next conversation rebuilds with fresh data
3. Tests: update profile entity → verify next agent has new data

### Phase 3: Remove tools, add resources

1. Remove `system_get-identity` tool from `shell/core/src/system/tools.ts`
2. Remove `system_get-profile` tool from `shell/core/src/system/tools.ts`
3. Remove `system_get-status` tool from `shell/core/src/system/tools.ts`
4. Add `brain://status` resource to `shell/core/src/system/resources.ts`
5. Remove `site-builder_list_routes` tool from `plugins/site-builder/src/tools/index.ts`
6. Remove `site-builder_list_templates` tool from `plugins/site-builder/src/tools/index.ts`
7. Add `site://routes` and `site://templates` resources to site-builder plugin
8. Update eval test cases that reference removed tools (system_get-profile is tested)
9. Tests

## Files affected

| Phase | Files | Nature                                                  |
| ----- | ----- | ------------------------------------------------------- |
| 1     | ~4    | brain-agent.ts, agent-service.ts, agent-types.ts, tests |
| 2     | ~2    | agent-service.ts subscription, tests                    |
| 3     | ~6    | Remove tools, add resources, update eval test cases     |

## Verification

1. `bun test` — all tests pass
2. `bun run typecheck` clean
3. Agent knows anchor name and site URL without tool calls
4. Profile/identity/site-info changes invalidate cached agent
5. `brain://identity`, `brain://profile`, `brain://status` resources return correct data
6. `site://routes` and `site://templates` resources return correct data
7. No `system_get-identity`, `system_get-profile`, `system_get-status`, `site-builder_list_routes`, `site-builder_list_templates` in tool listing
8. Eval test cases updated — no references to removed tools
