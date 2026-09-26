---
"@rizom/brain": patch
"@brains/plugins": patch
"@brains/contact": patch
"@brains/newsletter": patch
"@brains/notifications": patch
"@brains/unified-inbox": patch
"@brains/contracts": patch
"@brains/scheduler": patch
"@brains/site-professional": patch
---

Integrate optional Resend newsletter delivery and bounded Contact intake through declarative packages, without restoring retired plugin classes or private UI imports. Preserve provider-specific delivery metadata, shared email rendering, subscribe-only public signup, and disabled-by-default activation.

Keep Contact records restricted and out of search/projections, enforce atomic owned creation and content-hash updates, validate the actual mounted Inbox destination, and retain owner-qualified state, admission limits, retention, recovery, and delivery leases. Run retention through the shared scheduler-owned maintenance lifecycle so its health and readiness clock remain in the owning process; cancel and drain on shutdown.

Add narrowly scoped persistence validation, conditional owned writes, config-dependent service dependencies, and explicit worker request subscriptions. Preserve recurring-check execution dependencies in workers while excluding service ready hooks and HTTP routes. Make test storage honor persistence validators, write guards, cancellation, and atomic create-if-absent. Strip the system visibility envelope before strict domain frontmatter decoding and sanitize parser failures without exposing private YAML source buffers; verify restricted records across a real SQLite reopen.

Keep the opt-in professional homepage Contact opening on public UI components. This does not enable intake, approve authored copy, or establish running-app visual or deployment acceptance.
