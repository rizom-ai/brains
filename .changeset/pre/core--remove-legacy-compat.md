---
"@rizom/brain": patch
---

Data and scaffolds from old versions are no longer migrated. An agent file with kind `professional` or `collective` is refused like any other invalid file. A stored message that gives its actor as a bare actor id instead of an identity loses its actor, and summaries, decisions, action items and eval cases in that shape no longer parse. The static `MCP_AUTH_TOKEN` is now described as local development only. `brain init` and `brains-ops init` leave a `deploy.yml` or `.env.example` from the first init versions as it is. Chat no longer restores uploads saved under the old Discord and Slack upload kinds, and prompt copies stored under a template's short name are no longer deleted at boot.
