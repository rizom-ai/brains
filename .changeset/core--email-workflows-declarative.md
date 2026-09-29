---
"@brains/email-workflows": minor
"@brains/plugins": minor
"@brains/sdk": minor
"@brains/conversation-memory": patch
---

Migrate `@brains/email-workflows` to the declarative surface. The package is one `defineServicePlugin` (`email-workflows`) declaring the `mail-item` entity, importing `@brains/sdk`, `@brains/contracts` and `@brains/utils`. `EmailWorkflowsPlugin`, `MailItemPlugin`, the `emailWorkflows()` factory, the adapter classes and `EmailReplyDraftEntityPlugin` are deleted; the persist validator is an entity extension, the inbox source is the `inbox` slot, the list tool is a declared tool, and the thread-position migration runs from `ready`.

**Inbound mail is acknowledged once queued, not once written.** The `EMAIL_INBOUND` subscription validates the message and enqueues the `triage` job; the email interface advances its mailbox cursor on that answer, and the durable job queue carries the message from there. The job classifies against the operator-editable rubric, writes the mail item or discards it, and retries three times with the same attempt counter and "Unclassified email" fallback as before. A message the subscription cannot read is still refused, so the cursor holds.

**The list tool is `email-workflows_triage-list`,** named after the service that offers it; its filters and result are unchanged. The runtime-state namespaces for classification attempts and thread ordinals are now scoped under the package name, so the thread-position index rebuilds once on upgrade; the rebuild is idempotent.

The dormant reply-draft entity is a `defineEntity` (`emailReplyDraft`) the service does not declare, so it stays out of every brain until the drafting flow lands. Its operator takes narrow entity access and a delivery-provider lookup instead of the plugin context.

Three runtime additions, each with `@brains/email-workflows` as the named consumer: `count` on job entity access, for a list that reports its total beside a bounded page; `prompts.resolve` on the job context, for a job that classifies against a prompt the runtime keeps; and `messaging.request` on the reaction context, for an inbox item whose body only the delivering interface can fetch back. `@brains/sdk/entities` exports `inboxActorSchema`, `inboxItemIdSchema`, `InboxAction` and `InboxFacetDefinition`.
