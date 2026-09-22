# Plan: Resend as a newsletter provider

## Status

Implemented on `feat/newsletter-resend-provider`; awaiting review and a
credentialed Resend smoke test. Provider selection is exclusive, the new
discriminated configuration replaces the flat Buttondown configuration, and
Buttondown-only subscriber tags are rejected explicitly by Resend rather than
silently ignored.

## Declarative SDK integration in PR #301

The SDK branch integrates this feature as one default-exported service package with a `delivery` service and a `newsletter` entity. The parsed `provider` configuration selects Buttondown or Resend; no provider means no publisher, subscriber tool, route, or signup slot. The current management tool is `delivery_subscribers`, and both providers use the subscribe-only `/api/newsletter/subscribe` handler. Email rendering uses public `@rizom/brain-ui`.

The class/factory topology and provider-specific HTTP paths below describe the earlier design, not the current authoring API. No retired plugin classes or compatibility aliases are restored. Configure the provider payload through `plugins.newsletter` in `brain.yaml`. Local synthetic checks are separate from credentialed provider acceptance; no live send, release, or deployment is authorized here.

## Goal

Support Resend alongside Buttondown in `@brains/newsletter` while keeping the
newsletter entity, generation flow, subscriber tool, signup UI, and publish
pipeline provider-neutral.

The first implementation should:

- let one brain select Buttondown or Resend for newsletter delivery;
- render one shared branded HTML body for both providers;
- use provider-native subscriber and bulk-send APIs;
- preserve provider delivery IDs on newsletter entities; and
- avoid coupling `plugins/newsletter` to the Resend transport in
  `interfaces/email`.

## Current constraints

The package is currently Buttondown-specific in several places:

- `newsletter()` always returns the newsletter entity and `ButtondownPlugin`;
- `NewsletterPlugin` publishes through `BUTTONDOWN_CHANNELS`;
- newsletter metadata stores `buttondownId`;
- signup visibility is determined through a Buttondown configuration message;
- the public signup route currently targets the multi-action administrative
  subscriber tool;
- subscriber tools and auto-send accept `ButtondownClient` directly; and
- the content-pipeline registry owns one publish provider per entity type.

There is also an existing signup-path mismatch: `NewsletterSignup` defaults to
`/api/newsletter/subscribe`, while the Buttondown service contributes
`/api/buttondown/subscribe`.

Resend's transactional `/emails` endpoint, already used by
`interfaces/email`, is not the newsletter primitive. Newsletter delivery should
use Resend Contacts, Segments, and Broadcasts. Current Resend APIs require
`segment_id` for a Broadcast; the older Audience field is deprecated.

Buttondown's current Email API accepts either HTML or Markdown bodies, so both
providers can consume the same rendered HTML content.

## Proposed architecture

Exactly one newsletter delivery provider is active in a brain:

```text
newsletter() composite
├── NewsletterPlugin                 entity, generation, templates, datasource
└── ButtondownPlugin | ResendPlugin  subscribers, signup, delivery, auto-send
```

The entity plugin owns durable newsletter behavior only. The selected service
plugin owns external delivery and registers the actual `PublishProvider` for the
`newsletter` entity type.

Add a package-local contract similar to:

```ts
interface NewsletterDeliveryProvider extends PublishProvider {
  subscribe(input: NewsletterSubscribeInput): Promise<NewsletterSubscriber>;
  unsubscribe(email: string): Promise<void>;
  listSubscribers(
    input: NewsletterSubscriberListInput,
  ): Promise<NewsletterSubscriberList>;
  validateCredentials(): Promise<boolean>;
}
```

Public subscriber results should use provider-neutral statuses. Provider-only
features must not be silently ignored; for example, a Buttondown tag input must
either remain an explicitly supported extension or be removed through an
intentional contract change.

## Configuration

Use a discriminated provider configuration rather than adding more provider
fields to the current flat object:

```ts
newsletter({
  provider: {
    type: "resend",
    apiKey: "${RESEND_API_KEY}",
    segmentId: "${RESEND_NEWSLETTER_SEGMENT_ID}",
    from: "Rizom <newsletter@example.com>",
    replyTo: "hello@example.com",
    topicId: "${RESEND_NEWSLETTER_TOPIC_ID}",
  },
  autoSendOnPublish: false,
});
```

Buttondown uses the same discriminator:

```ts
newsletter({
  provider: {
    type: "buttondown",
    apiKey: "${BUTTONDOWN_API_KEY}",
    doubleOptIn: true,
  },
  autoSendOnPublish: false,
});
```

`doubleOptIn` belongs only to the Buttondown branch. Selecting Resend requires
`apiKey`, `segmentId`, and `from`; `replyTo` and `topicId` are optional.

When no provider is configured, newsletter entities and generation remain
available, but no subscriber tool, public signup route, signup slot, or publish
provider is registered.

## Shared email rendering

Add one package-owned renderer:

```ts
renderNewsletterEmail(markdown) => { html, text }
```

The renderer should:

1. convert the entity's Markdown body with the existing sanitized
   `markdownToHtml` implementation;
2. wrap it in an email-safe document with shared typography, spacing, colors,
   link treatment, and preview text support; and
3. produce a plain-text fallback from the same source.

The branded content HTML is shared and snapshot-tested once. Provider adapters
may add only transport-specific details:

- Buttondown receives the shared HTML body with the explicit editor mode needed
  for HTML and may apply its configured provider template;
- Resend receives the shared `html` and `text` in a Broadcast request; and
- provider-managed unsubscribe, preference, and tracking markup remains outside
  the shared body.

This makes authored content and branding identical without claiming that the
complete delivered MIME document is byte-identical after each provider adds its
own compliance or tracking envelope.

## Provider behavior

### Buttondown

Refactor the existing plugin without changing its external behavior:

- adapt `ButtondownClient` to the provider-neutral contract;
- register a real Buttondown `PublishProvider` with the content pipeline;
- send the shared HTML body;
- keep native double opt-in and subscriber operations;
- retain `buttondownId` as its publish result field; and
- register the signup slot with `/api/buttondown/subscribe` explicitly.

### Resend

Add a Resend client and service plugin under `src/provider/resend/`.

Subscriber operations:

- subscribe by creating or reactivating a Contact, assigning it to the
  configured Segment, and opting it into the configured Topic when present;
- treat an already-present Contact as an idempotent success and ensure Segment
  membership;
- unsubscribe by removing the Contact from this Segment rather than deleting or
  globally suppressing the Contact; and
- list subscribers from the configured Segment with bounded pagination.

Publishing:

- create a Broadcast with `segment_id`, `from`, `subject`, shared `html` and
  `text`, optional `reply_to` and `topic_id`, and `send: true`;
- return the Broadcast ID to the content pipeline;
- store that ID as `resendBroadcastId`; and
- let the content pipeline update `status` and `sentAt` only after Resend accepts
  the Broadcast.

Resend API failures must propagate as publish failures and must not mark the
newsletter published.

### Auto-send on post publication

Extract the existing post-publication handler to depend on
`NewsletterDeliveryProvider`, not `ButtondownClient`. The selected provider is
called exactly once. Non-post events remain ignored.

## Signup ownership

Move signup-slot registration from `NewsletterPlugin` to the configured service
plugin. Each public route targets a dedicated subscribe-only tool that is hidden
from agent and direct MCP surfaces; it must never expose the administrative
`newsletter_subscribers` list or unsubscribe actions. The provider supplies the
correct action URL and success text:

- Buttondown double opt-in may say to check email for confirmation;
- immediate Buttondown or Resend subscriptions must say the user is subscribed;
- already-subscribed responses retain their distinct message.

This also fixes the current `/api/newsletter/subscribe` versus
`/api/buttondown/subscribe` mismatch without introducing an unowned global HTTP
route.

## Entity and environment changes

Update newsletter frontmatter and metadata schemas with optional
`resendBroadcastId` while retaining `buttondownId`.

Add newsletter-specific Resend environment declarations, expected to include:

- `RESEND_API_KEY`;
- `RESEND_NEWSLETTER_SEGMENT_ID`;
- `RESEND_NEWSLETTER_FROM`; and
- optional reply-to/topic values if they are interpolated from the environment.

The newsletter plugin must not import from `interfaces/email`; shared code should
be extracted into an appropriate shared package only if real duplication later
justifies that boundary.

## Implementation phases

### Phase 1 — provider seam with unchanged Buttondown behavior

- Add provider-neutral subscriber and delivery contracts.
- Add the shared HTML/text renderer and snapshots.
- Decouple `NewsletterPlugin` from `BUTTONDOWN_CHANNELS`.
- Register Buttondown directly with the publish pipeline.
- Move signup registration to Buttondown and correct its route action.
- Keep existing Buttondown client and behavior tests green.

### Phase 2 — Resend adapter

- Implement the authenticated Resend HTTP client with Zod response parsing and
  structured errors.
- Implement Contact/Segment subscribe, unsubscribe, and list behavior.
- Implement Broadcast creation and immediate send.
- Add `ResendPlugin`, canonical subscriber tooling, API route, signup slot, and
  publish registration.

### Phase 3 — composition and durable metadata

- Add the discriminated composite config and instantiate only the selected
  provider.
- Add `resendBroadcastId` to newsletter schemas and adapters.
- Make auto-send use the selected provider abstraction.
- Add environment declarations and regenerate canonical environment fixtures.

### Phase 4 — documentation and integration validation

- Update package descriptions, newsletter entity reference, setup examples, and
  HTTP-route fixtures.
- Verify an app-configured Buttondown brain and Resend brain independently.
- Verify a provider-less brain can generate drafts but cannot publish or expose
  signup controls.

## Validation

Required automated coverage:

- composite config selects exactly one provider and rejects incomplete branches;
- the same shared HTML body fixture reaches both provider clients;
- provider-specific wrappers do not alter the shared content body;
- Resend subscribe is idempotent and ensures Segment membership;
- Resend unsubscribe removes only Segment membership;
- Resend list pagination is bounded and normalized;
- Broadcast requests contain the configured sender, Segment, subject, HTML,
  text, and optional topic/reply-to fields;
- successful publishes persist the correct provider ID and `sentAt`;
- failed API calls do not mark entities published;
- only the selected provider receives auto-send events; and
- configured signup routes and rendered form actions match.

Targeted checks:

```bash
cd plugins/newsletter
bun test
bun run typecheck
bun run lint

cd ../..
bun test packages/brain-cli/test/http-route-manifests.test.ts
bun run env-schema:check
bun run docs:check
```

Run `bun run arch:check` if package imports or boundaries change.

## Non-goals

- Sending every newsletter through both providers.
- Migrating subscribers between Buttondown and Resend.
- Sharing runtime configuration with `interfaces/email`.
- Provider-independent analytics, webhook ingestion, or delivery-event syncing.
- Resolving rich entity/image references inside newsletter Markdown in this
  slice.
- Building Resend double opt-in in the initial provider adapter.

## Decisions

- Provider selection is exclusive rather than fan-out.
- The current flat `{ apiKey, doubleOptIn }` configuration is replaced rather
  than retained as a deprecated shorthand.
- Buttondown subscriber tags remain available; Resend rejects non-empty tags
  explicitly because it cannot preserve their Buttondown semantics.

Resend double opt-in, if required later, is a separate slice: it needs a pending
subscription record, transactional confirmation email, signed expiring token,
and public confirmation callback rather than a provider-adapter flag.

## Plan retirement

Delete this file once Resend support is implemented and the durable behavior is
captured in package documentation and changelogs, or if provider support is
superseded by a broader newsletter delivery design.
