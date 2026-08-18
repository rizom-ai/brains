---
"@brains/agent-discovery": patch
"@brains/core": patch
"@brains/recurring-checks": patch
---

Replace generic recurring-check Inbox rollups for agent sightings with individual, informative Agent sightings items. Each item identifies the agent and introducers, exposes bounded public-card context for discussion, links to its source entity, and offers confirmation-gated Connect or Dismiss actions.

Allow an individual recurring alert to remain channel-only without suppressing the same check's other Inbox alerts, and label generic recurring-alert acknowledgement honestly as **Dismiss**.
