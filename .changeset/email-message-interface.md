---
"@brains/email": minor
"@brains/plugins": patch
"@brains/notifications": patch
"@brains/rover": patch
"@brains/relay": patch
"@rizom/brain": patch
"@rizom/ops": patch
---

Replace the standalone Email Resend service with an outbound-first Email message interface. Email now owns its channel descriptor and configured Resend provider, Notifications remains channel-agnostic, channel registration is restricted to message-interface plugins, and brain configuration uses `plugins.email`; existing `plugins.email-resend` configuration must be renamed.
