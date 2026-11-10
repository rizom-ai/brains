---
"@rizom/brain": patch
---

A first-party service's tool can keep the bare name its class registered it under, such as `playbook_manage` or `inbox_list`, rather than one prefixed with the service's id, so agents, evals and the brain's own turn handling keep calling it by that name. The public `defineTool` still prefixes every tool.
