# Rover agent tool surface

Snapshot captured 2026-07-30 from:

```bash
cd brains/rover
bun run eval:core:coverage
bun run eval:default:coverage
bun run eval:full:coverage
```

Coverage checks compare eval assertions against Admin-visible agent tools. Direct-MCP-only adapter tools such as `chat` and `confirm` are intentionally absent from these lists.

Canonical replacements for removed legacy registered tool names:

| Prior namespace                       | Canonical tool           |
| ------------------------------------- | ------------------------ |
| Playbook lifecycle/status/event tools | `playbook_manage`        |
| Directory sync/status/history tools   | `directory_sync`         |
| Publishing queue/publish tools        | `publishing_manage`      |
| Buttondown subscriber tools           | `newsletter_subscribers` |

Maintenance operations `content-pipeline_ensure-assets` and `obsidian-vault_sync-templates` now run through lifecycle/direct service paths instead of the agent or direct-MCP tool registry.

## Core preset

- Agent tools: 18
- Asserted tools: 18
- Missing assertions: 0
- Stale assertions: 0

```text
agent_call
agent_connect
agent_scan_directories
agent_set_trust_level
auth-service_get_passkey_setup_url
directory_sync
playbook_manage
system_create
system_delete
system_extract
system_generate
system_get
system_insights
system_job_status
system_list
system_search
system_status
system_update
```

## Default preset

- Agent tools: 19
- Asserted tools: 19
- Missing assertions: 0
- Stale assertions: 0

```text
agent_call
agent_connect
agent_scan_directories
agent_set_trust_level
auth-service_get_passkey_setup_url
directory_sync
playbook_manage
site-builder_build-site
system_create
system_delete
system_extract
system_generate
system_get
system_insights
system_job_status
system_list
system_search
system_status
system_update
```

## Full preset

- Agent tools: 20
- Asserted tools: 20
- Missing assertions: 0
- Stale assertions: 0

```text
agent_call
agent_connect
agent_scan_directories
agent_set_trust_level
auth-service_get_passkey_setup_url
directory_sync
playbook_manage
publishing_manage
site-builder_build-site
system_create
system_delete
system_extract
system_generate
system_get
system_insights
system_job_status
system_list
system_search
system_status
system_update
```

`auth-service_get_passkey_setup_url` is contextual: it appears in fresh eval setups while first-passkey setup is incomplete and drops out after setup is complete.
