---
"@brains/cms": patch
"@brains/console-theme": patch
"@brains/web-chat": patch
"@brains/dashboard": patch
---

The CMS editor joins the console: its shell serves the shared
@brains/console-theme sheet (paper climate default, console-wide
console.climate preference wins) and the console strip with route-derived
surface links; the appbar slims to a surface-local crumb bar; the local
paper palette and IBM Plex Mono are replaced by console tokens and
JetBrains Mono. The strip's HTML renderer and the console fonts URL move
into @brains/console-theme, shared by web-chat and the CMS shell.
