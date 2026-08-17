---
"@brains/plugins": patch
"@brains/chat": patch
"@brains/web-chat": patch
"@brains/webserver": patch
"@brains/mcp": patch
"@brains/core": patch
"@brains/job-queue": patch
"@brains/entity-service": patch
"@brains/ai-service": patch
"@brains/ai-evaluation": patch
"@brains/auth-service": patch
"@brains/recurring-checks": patch
"@brains/conversation-memory": patch
"@brains/directory-sync": patch
"@brains/content-pipeline": patch
"@brains/site-builder-plugin": patch
"@brains/stock-photo": patch
"@brains/analytics": patch
"@brains/app": patch
---

Narrow service dependencies to the members their consumers actually call, so a
stand-in can be checked against them rather than asserted into place.

Most of this is additive or loosening: a function that asked for a whole
`IEntityService`, `IConversationService`, `IJobQueueService`, `PasskeyService`
or `SimpleGit` now asks for the two or three methods it uses, which accepts
strictly more than before. Several constructors dropped a lone overload that
hid a `runtimeOptions` parameter their implementations already accepted, and a
few internals became module-level exports.

One change narrows rather than widens: `IRuntimeUploadsNamespace.scoped()`
returns `ScopedRuntimeUploadStore` — the seven methods the store offers —
instead of the concrete `RuntimeUploadStore` class. Code calling those methods
is unaffected; code reaching into the class's private fields is not, which was
the point.

`shell/ai-evaluation` also drops an `eval` script that pointed at a directory
with no eval config and so could never run. The canonical entry point,
`cd packages/brain-cli && bun run eval`, is unchanged.
