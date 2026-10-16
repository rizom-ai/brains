---
"@brains/plugins": patch
---

Stop admission across all plugin-scoped message subscriptions before teardown, then drain handlers that were already admitted before invoking plugin shutdown. This prevents in-flight MessageBus callbacks from continuing against torn-down plugin state while preserving Promise-based handler APIs and synchronous unsubscribe handles.
