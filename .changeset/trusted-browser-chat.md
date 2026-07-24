---
"@brains/web-chat": patch
"@brains/admin": patch
---

Allow active Trusted users to use browser chat at their exact permission level across messages, confirmations, actions, attachments, uploads, jobs, and session operations. Reject authenticated non-Admins at the `/admin` server boundary before rendering the administration application.
