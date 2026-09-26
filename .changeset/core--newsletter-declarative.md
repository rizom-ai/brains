---
"@brains/newsletter": minor
"@brains/sdk": minor
---

Migrate `@brains/newsletter` to the declarative surface. The package is one `defineServicePlugin` (`buttondown`) declaring the `newsletter` entity, importing `@brains/sdk`, `@brains/contracts`, `@brains/utils` and `@rizom/brain-ui`. `NewsletterPlugin`, `ButtondownPlugin`, the composite `newsletter()` factory, the generation job handler class, the entity adapter class, and the two private bus channels the classes used to ask each other about configuration and to hand over an email are deleted.

**The subscriber tool is `buttondown_subscribers`.** A tool is named after the service that offers it, and the service cannot share the entity type's name. Its actions, input and output are unchanged.

**The signup form posts to `/api/newsletter/subscribe`,** a handler route the service declares once an API key is configured. The UI component always posted there; the tool-backed route it replaces was mounted at `/api/buttondown/subscribe`. A scripted form gets `{ success, data }` or `{ success: false, error }` as JSON; a plain form submission is redirected to `/subscribe/thanks` or `/subscribe/error` as before.

**Without an API key the package declares no publisher.** The entity plugin used to announce an internal provider that recorded `internal` as the send id for a newsletter nobody could send; publishing a newsletter now requires Buttondown to be configured, and the provider records the Buttondown email id in `buttondownId` and the send time in `sentAt` as before.

A scheduled newsletter is the runtime's batch scheduled generation from the ten most recent published posts, the same input the entity's own subscriber used to build. The signup slot is offered from the service's `ready` hook rather than after asking the bus whether Buttondown is configured.

`@brains/sdk/services` exports `verbatim`, for a service route whose answer is the response itself. Named consumer: `@brains/newsletter`, which redirects a plain form submission.
