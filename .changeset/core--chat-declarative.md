---
"@brains/chat": minor
"@brains/plugins": minor
"@brains/sdk": minor
---

Migrate `@brains/chat` to the declarative surface, as one package declaring two message interfaces. `ChatInterface`, the turn controller, the response coordinator and the Chat SDK host class are deleted; Discord and Slack are each a `defineMessageInterface` over the package's config, emitted only when that platform's adapter is configured, with their own Chat SDK app, listener loop, registries and channel type. The class re-routed progress and tool events that came back under a platform's name to itself; nothing re-routes now.

**Plugin ids change.** The runtime plugin is `@brains/chat:discord` or `@brains/chat:slack`, never `chat`. Conversation ids stay `discord-<thread>` and `slack-<thread>`, so live threads keep their history and pending approvals. Thread subscriptions are filed under the interface's own runtime-state namespace, so subscribed threads re-subscribe on the next mention. The channel descriptors no longer carry `manualDelivery`, which nothing read. A platform that is not configured declares no routes at all, rather than webhook routes that only 404.

**A reply that is not a yes or a no goes through as a new question while an approval is pending**, for every declared message interface; the approval stays pending. The runtime nagged with "Please reply with yes to confirm or no/cancel to abort."

The declarative contract grows what chat needed, each with `@brains/chat` as the named consumer: `defineMessageInterfacePackage` (several message interfaces from one config); `conversationKey` as a function; `present` receives `confirmation` (with the approvals still `remaining`) and the caller's `permissionLevel`, and may post the answer itself and hand back the message id the runtime tracks; `send` and `edit` carry the progress `event` behind a progress-origin message; `MessageChannel.name`; `spaces` on the interface setup context; `messages.pendingApprovals(channel)`; and the runtime tracks the jobs an artifact card waits on, not only a tool's. The SDK's `interfaces` entry publishes the presentation, attribution, upload-continuity and URL-capture helpers chat renders with.

Chat stores the pipeline's actor and source shapes on messages; `username`, `isBot`, `guildId` and `actionId`, which nothing read back, are no longer recorded.
