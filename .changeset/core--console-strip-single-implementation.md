---
"@brains/console-theme": patch
"@brains/dashboard": patch
"@brains/studio": patch
"@brains/admin": patch
"@brains/web-chat": patch
---

Render the console strip from one implementation.

The strip existed twice — an HTML string in `@brains/console-theme` for the
server-rendered shells and a parallel Preact component in the dashboard — with
a comment asking to "keep the two in step". They had already drifted: the
string version hardcoded an "Authenticated / AU" session chip while the
dashboard showed the principal's name, role, and initials, and a visitor state.

`renderConsoleStripHtml` now owns the full behavior (principal chip, visitor
chip, HTML-escaped interpolation) and the dashboard injects the shared inner
markup instead of restating it. The CMS editor and the admin and account
consoles pass the principal they already hold, so their chips now show the
signed-in user instead of the generic copy; web-chat keeps the role-neutral
chip until its interface threads the principal through.
