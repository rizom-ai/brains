---
"@brains/admin": patch
"@brains/cms-config": patch
"@rizom/ops": patch
---

Improve CMS defaults and rover-pilot onboarding guidance.

- fix `@brains/admin` `/cms` bootstrapping so Sveltia uses the inline config instead of failing to fetch a missing config file
- make the base entity default to `Note` / `Notes` in `@brains/cms-config` when no explicit display override is provided
- update the published `@rizom/ops` rover-pilot onboarding docs to frame Discord, Dashboard, and CMS as the default experience, with Git, Obsidian, and MCP as optional workflows
