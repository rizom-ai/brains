---
"@rizom/brain": patch
---

The Obsidian vault's fileClasses, templates and bases leave out the fields a type marks `studioWidget: "hidden"`: internal bookkeeping no one authors, which Studio's form already leaves out. These fields no longer appear in the vault:

- action-item: `conversationId`, `channelId`, `projectedBodyHash`, `projectedAssigneeHash`, `projectedDueDate`
- agent: `cardLastError`, `cardFailureCount`, `cardUnavailableAt`, `cardStaleAfter`
- decision: `conversationId`, `channelId`
- prompt: `slug`, `defaultHash`
- summary: `channelId`, `sourceHash`
- doc: `authoredSlug`
- wish: `slug`
- book: `continuations`
- email-reply-draft: `revision`, `providerDeliveryId`

The declared deck's `error` and `authoredSlug` stay out of it, as the deck plugin class's vault output had them.
