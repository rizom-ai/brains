---
"@brains/core": patch
"@brains/plugins": patch
"@brains/webdav": patch
---

The brain tells its plugins it is stopping (`system:shutting-down`) first of all, before the HTTP host stops admitting requests and drains the ones in flight. A plugin that holds a request open until something happens lets it go there. The drive's change feed does: a sync client waiting for changes is answered at once, so a brain with a vault connected stops without waiting out the host's five-second drain.
