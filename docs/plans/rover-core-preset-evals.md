# Plan: Exhaustive core-preset eval set for Rover

## Status

The preset-aware harness has landed and merged to main. A `--preset <name>` runner flag
boots a named preset hermetically (atproto, email-resend, and other live-effect plugins
stay in `evalDisable`); eval suites are declarative and inheritable in `brain.eval.yaml`
(`core` runs `preset-core`, `default` extends `core` with `preset-default`, `full`
extends `default` with `preset-full`); a committed tool-coverage ledger keeps "exhaustive"
measurable (17/17 core tools asserted); and a case-level `permissions:` matrix plus
turn-level multi-user context exercise public/trusted/anchor boundaries — including
approval-hijack and shared-thread write denials — inside single multi-turn conversations.
The 136 existing fixtures split 67 / 33 / 36 across the three tiers.

Remaining work is filling the behavioral coverage so the suite stays exhaustive as new
core behavior lands.

## Remaining: fill the coverage

The tool-assertion ledger is empty, but behavioral depth is still thin. Write cases for the
known gaps: `system_status`, `system_insights` (topics), `system_check-job-status`,
`system_extract` on topics, conversation tools, wishlist beyond the single lasagna
regression, and multi-turn plus response-quality cases on core content (note/link/topic
recall, empty states, follow-ups) — the current multi-turn set is half web-chat upload
flows, which are full-preset territory. Filling new default/full coverage gaps is the
natural follow-up; multi-model parallelism stays in `parallel-eval-workers.md`.

## Cost note

The full-preset suite averages ~15k tokens per case. The core subset is smaller, but the
permission matrix multiplies runs — keep `--tags` subsets first-class so day-to-day runs
stay cheap, and reserve the full matrix for the release gate.
