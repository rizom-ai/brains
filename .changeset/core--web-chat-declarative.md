---
"@rizom/brain": patch
---

Web chat is a declarative interface. The Ask page, chat API, guest chat, uploads, streamed replies, job progress and tool statuses, the guest monitor in Studio and the guest-maintenance cycle work as before.

Web chat's `guest` setting stays unset when a brain leaves it out: unset still means guest chat is off with the owner's switch available, as before, and is now told apart from `false` in the parsed config rather than from the raw input. The canonical route manifests now list web chat's six guest API routes, which a running brain already served once web chat registered.
