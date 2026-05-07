# Relay eval content

This directory is the Relay-specific fixture corpus used by local test apps and evals.

It intentionally contains content for **existing Relay plugins only**. Do not add meeting-notes, decision-record, team-digest, RAG, graph, or other future-plugin content here until those plugins exist.

## Current fixture coverage

- `brain-character/` — Relay identity and operating voice
- `anchor-profile/` — team/organization profile
- `site-info/` — public site metadata
- root `.md` files — general team notes (`base` entities)
- `prompt/` — editable prompt entities
- `link/` — captured team reference links
- `summary/` — durable conversation summary examples
- `agent/` and `skill/` — peer-brain directory and advertised skills
- `swot/` — assessment output fixture
- `site-content/` — route/section copy for the minimal site stack
- `doc/` and `deck/` — full-preset team knowledge surfaces

## Authoring rules

- Keep fixtures concrete and team-shaped.
- Keep each file valid for its owning entity adapter.
- Avoid generic product documentation copied from `docs/`.
- Avoid content for plugins that do not exist yet.
