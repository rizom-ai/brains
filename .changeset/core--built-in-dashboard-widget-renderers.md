---
"@brains/plugins": patch
"@brains/dashboard": patch
"@brains/topics": patch
"@brains/agent-discovery": patch
---

Give the console's knowledge and agent maps their real renderers back. A
first-party widget registered through `registerBuiltInDashboardWidget` may now
pass a `render` component; the dashboard resolves it from its own registry at
render time and draws it in place of the declarative body, inlining the
renderer's styles and script. Widget components never travel with widget data,
and the published authoring path still produces declarative widgets only, so
external services are unchanged. Self-drawing widgets keep deriving their
semantic view and digest — the blocks remain the map's text detail and its
digest strip stays live — and now carry their own data beside it.
