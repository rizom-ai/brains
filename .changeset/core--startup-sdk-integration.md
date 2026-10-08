---
"@brains/plugins": patch
"@brains/core": patch
"@brains/directory-sync": patch
"@brains/onboarding": patch
"@brains/profile": patch
"@brains/site-builder-plugin": patch
"@rizom/brain": patch
---

Integrate queued startup imports through declared subscriptions and installed, package-scoped batch status reads. Progress is a wakeup, not authority to claim completion; old unfinished batches and the new full repair sweep must settle. A transient status-read failure leaves startup pending and is logged; a later notification can retry the read.

The deferred startup continuation belongs to the shell lifecycle: cancellation prevents late prompt materialization, settled announcements and index monitoring after shutdown. Failed settlement does not start the readiness monitor.

Builds within one site-builder instance are serialized because preview and production share a mutable route registry. They retain separate outputs and per-environment supersession; shutdown cancels and drains queued work. This avoids concurrent startup rebuilds changing each other's route collection and fingerprints.

Host-owned seed declarations wait for startup content to settle rather than racing imported content. Onboarding starters, starter identity and rebuilds of existing site outputs follow the settled-content lifecycle. Keep the shell-owned HTTP host and public UI; do not restore native directory-sync or site-builder authoring bridges.
