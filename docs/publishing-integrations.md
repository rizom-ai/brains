# Publishing Integrations and Site Add-ons

A brain publishes to its own site out of the box. This page covers the integrations that carry content further (LinkedIn, newsletters, the AT Protocol), the services that support publishing (analytics, stock photos, LinkedIn profile import) and the opt-in site add-ons that collect input from visitors (contact form, quizzes and other forms).

Each integration is off until it is selected and given its credentials. Some are members of a bundle; others are add-ons selected with `add:`. Secrets go in `.env` and are referenced from `brain.yaml` with `${VAR}`, except the few the brain reads directly (noted below). The full variable list is in the [brain.yaml Reference](../packages/brain-cli/docs/brain-yaml-reference.md#integrations). A deployed brain receives only the variables listed under `env.secret` in `config/deploy.yml`, so add any you use there (see the [Deployment Guide](../packages/brain-cli/docs/deployment-guide.md)).

## At a glance

| Integration      | Capability        | Selected by                 | Credentials                                                  | Results show up in                                |
| ---------------- | ----------------- | --------------------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| LinkedIn posting | `social-media`    | `publishing` bundle         | `LINKEDIN_ACCESS_TOKEN`, optional `LINKEDIN_ORGANIZATION_ID` | Studio → Publish → Publishing; LinkedIn           |
| Newsletter       | `newsletter`      | `publishing` bundle         | Buttondown or Resend keys                                    | Studio → Publish → Publishing; site footer signup |
| AT Protocol      | `atproto`         | `federation` bundle         | `ATPROTO_APP_PASSWORD`                                       | The brain's PDS repo                              |
| Site analytics   | `analytics`       | `site` bundle               | `CLOUDFLARE_*`                                               | Studio → Publish → Traffic; `system_analytics`    |
| Stock photos     | `stock-photo`     | `publishing` bundle         | `UNSPLASH_ACCESS_KEY`                                        | Image entries; cover images                       |
| LinkedIn import  | `linkedin-import` | `add:`                      | A LinkedIn app, or the managed broker                        | Studio → Library → LinkedIn; the Anchor profile   |
| OAuth broker     | `oauth-broker`    | `add:` (central brain only) | The provider app's client id and secret                      | Nothing visible; it serves other brains           |
| Contact form     | `contact`         | `add:`                      | None (alerts use `notifications`)                            | `/contact`; Studio Inbox; owner email             |
| Quizzes          | `quiz`            | `add:`                      | None                                                         | Your quiz pages; Studio Library and Inbox         |
| Forms            | `form`            | `site` bundle               | None                                                         | The form's page; its target's records             |

## LinkedIn posting

The `social-media` capability (in the `publishing` bundle) keeps social posts as `social-post` entries: short posts drafted for LinkedIn, written by the AI in the brain's voice, as the Anchor. With a LinkedIn access token, the content pipeline publishes queued posts to LinkedIn: text, an image from `coverImageId`, or a native PDF document post from `documents`. A published post records `platformPostId` and `publishedAt`.

```yaml
plugins:
  social-media:
    linkedin:
      accessToken: ${LINKEDIN_ACCESS_TOKEN}
      # Post as an organization instead of a person (needs the w_organization_social scope):
      organizationId: ${LINKEDIN_ORGANIZATION_ID}
    autoGenerateOnBlogPublish: true
```

- Without `accessToken`, posts are kept and can be drafted, but not published to LinkedIn.
- `autoGenerateOnBlogPublish` writes a LinkedIn draft for each blog post when it is queued. The `publishing` bundle turns it on; it defaults to `false` otherwise.
- The `publishing` bundle also schedules social-post generation daily, skipped while a social-post draft is waiting. A scheduled post shares a recent published blog post no social post was written from yet.
- Ask the brain to write a post from text, from a blog post or deck, or from a prompt (`system_generate` with `social-post`).

Posts move through the Publishing board in Studio like any publishable type: Drafts, Queued, Published, Failed (see [Studio](./studio.md#publish)). Sites can list them with `social-media:social-post-list` and `social-media:social-post-detail`.

## Newsletter

The `newsletter` capability (in the `publishing` bundle) keeps `newsletter` entries and, with a delivery provider, sends them. Configure one provider, Buttondown or Resend:

```yaml
plugins:
  newsletter:
    provider:
      type: buttondown
      apiKey: ${BUTTONDOWN_API_KEY}
      doubleOptIn: true # default: new subscribers confirm by email
    autoSendOnPublish: false # default
```

```yaml
plugins:
  newsletter:
    provider:
      type: resend
      apiKey: ${RESEND_API_KEY}
      segmentId: ${RESEND_NEWSLETTER_SEGMENT_ID}
      from: ${RESEND_NEWSLETTER_FROM} # a verified sender
      replyTo: ${RESEND_NEWSLETTER_REPLY_TO} # optional
      topicId: ${RESEND_NEWSLETTER_TOPIC_ID} # optional
```

With a provider:

- Newsletters publish through the content pipeline, so they appear on the Publishing board. A sent issue records `sentAt`.
- The site gets a signup form in its footer. Visitors subscribe through the public `newsletter_signup` tool behind it; `newsletter_subscribers` lists, adds and removes subscribers.
- `autoSendOnPublish: true` creates and sends a newsletter each time a blog post is published.

The `publishing` bundle schedules a weekly newsletter draft (Mondays), skipped while a draft exists or when there is no post to draw from. Without a provider, newsletter entries are still kept and drafted, but not sent.

## AT Protocol

The `atproto` capability (in the `federation` bundle) publishes the brain to an AT Protocol PDS, such as a Bluesky account. `ATPROTO_APP_PASSWORD` is read directly from the environment; the account identifier goes in `brain.yaml`:

```yaml
plugins:
  atproto:
    pdsEndpoint: https://bsky.social # default
    identifier: example.com # handle or account DID
```

With an identifier and an app password, publishing is automatic and the capability has no tools:

- When the brain starts, it writes its brain card as `ai.rizom.brain.card/self`, and rewrites it when the brain's identity, Anchor profile or skills change.
- When a public entry of a type with an AT Protocol projection is published, it is written as a record (for example `ai.rizom.brain.post` for blog posts and `ai.rizom.brain.socialPost` for social posts). Updates keep the record current; an entry made non-public or deleted has its record deleted.
- A PDS outage never fails the local publish; the failure is logged.

The records and their schemas are described in [ATProto Lexicons](./atproto-lexicons.md). The plugin's README covers DIDs, discovery and the lexicon authority setting (`plugins/atproto/README.md`).

## Site analytics

The `analytics` capability (in the `site` bundle) reads site traffic from Cloudflare Web Analytics. Create a Web Analytics site for your domain in Cloudflare, then:

```yaml
plugins:
  analytics:
    cloudflare:
      accountId: ${CLOUDFLARE_ACCOUNT_ID}
      apiToken: ${CLOUDFLARE_API_TOKEN} # needs Analytics:Read
      siteTag: ${CLOUDFLARE_ANALYTICS_SITE_TAG}
      # Only when the domain is not proxied through Cloudflare:
      beaconToken: ${CLOUDFLARE_ANALYTICS_BEACON_TOKEN}
```

If the domain is proxied through Cloudflare (automatic setup), Cloudflare injects the tracking beacon and you leave `beaconToken` unset. Otherwise set it to the site token from Cloudflare's JS snippet, and the brain adds the beacon to every page it builds.

What you get:

- **Traffic snapshots.** A daily check stores each day's traffic in weekly `traffic-snapshot` entries (restricted, read-only), and backfills earlier days Cloudflare still returns.
- **Studio → Publish → Traffic** (Admin): the last 7, 30 or 90 days, against the period before; the busiest day; a daily chart with publish dates marked; the most-read published pieces; top pages, referrers and countries. The owner's own pages (`/studio`, `/login`, `/dashboard`, …) are counted apart.
- **Reports** for Admin callers through `system_analytics`: `traffic-overview`, `traffic-series` and `traffic-by-entity`. Ask the brain ("how did last month's posts do?") or call them directly.

## Stock photos

The `stock-photo` capability (in the `publishing` bundle) searches Unsplash. It offers its tools only with an API key:

```yaml
plugins:
  stock-photo:
    apiKey: ${UNSPLASH_ACCESS_KEY}
```

`stock-photo_search` returns candidates with previews. `stock-photo_select` stores the chosen photo as an image entry, with the photographer's attribution, records the download with Unsplash as its terms require, and can set the photo as an entry's cover image. Ask the brain to find a cover for a post and it uses both.

## LinkedIn profile import

The `linkedin-import` add-on fills the Anchor profile from the Anchor's LinkedIn profile. It appears in **Studio → Library → LinkedIn**, only to the Anchor (an Admin who is the Anchor):

1. **Connect LinkedIn** sends you to LinkedIn's consent page and back. The token is stored encrypted in your Account settings, under **LinkedIn**; it never reaches the browser.
2. For each of name, headline, industry, location, website and the profile story, the page shows the profile's value, LinkedIn's value and what an import would do: **Fill** (the profile has no value, or still holds a placeholder), **Keep yours** (you wrote something different) or **Same**.
3. **Import from LinkedIn** asks for confirmation with the fields it would fill, and writes only if neither side changed since the preview.

**Disconnect LinkedIn** forgets the token. Only members in the European Economic Area can consent to the LinkedIn API this uses (Member Data Portability). Account settings need `ACCOUNT_SETTINGS_ENCRYPTION_KEY`.

Configure either your own LinkedIn app or the managed broker, not both:

```yaml
add:
  - linkedin-import
plugins:
  linkedin-import:
    # Your own LinkedIn app, approved for Member Data Portability (3rd Party):
    oauth:
      clientId: ${LINKEDIN_IMPORT_CLIENT_ID}
      clientSecret: ${LINKEDIN_IMPORT_CLIENT_SECRET}
      redirectUri: https://brain.example.com/linkedin/oauth/callback
```

```yaml
plugins:
  linkedin-import:
    # Or through a managed broker that holds the LinkedIn app:
    broker:
      url: https://connect.example.com
      instanceId: ada
      secret: ${LINKEDIN_IMPORT_BROKER_SECRET}
      returnUri: https://ada.example.com/linkedin/oauth/broker/return
```

The redirect URI must end at `/linkedin/oauth/callback`, and the broker return URI at `/linkedin/oauth/broker/return`. Without either, the add-on registers nothing.

## OAuth broker

The `oauth-broker` add-on runs on one central brain that holds a provider's app secret and its single registered callback, so other brains can connect to that provider without holding the secret. Today the provider is LinkedIn, for `linkedin-import`.

```yaml
add:
  - oauth-broker
plugins:
  oauth-broker:
    publicUrl: https://connect.example.com
    providers:
      linkedin:
        clientId: ${LINKEDIN_BROKER_CLIENT_ID}
        clientSecret: ${LINKEDIN_BROKER_CLIENT_SECRET}
    instances:
      - id: ada
        secret: ${BROKER_INSTANCE_ADA_SECRET} # at least 32 characters
        returnUris:
          linkedin: https://ada.example.com/linkedin/oauth/broker/return
```

Register `https://connect.example.com/oauth-broker/callback/linkedin` as the LinkedIn app's redirect URI. Each instance brain uses its `id` and `secret` as `instanceId` and `secret` in its own `linkedin-import.broker` config. The broker hands each brain a one-time grant, valid for two minutes, that the brain redeems server to server; it keeps no credential afterwards. Removing an instance revokes it. Without instances the broker serves no routes.

## Contact form

The `contact` add-on puts a contact form on the site at `/contact`, with no configuration:

```yaml
add:
  - contact
```

- The form asks for a name, an email and a message. `/contact?topic=…` prefills the message; after sending, the visitor sees `/contact/thanks`.
- Each submission is a `contact-request` entry: always restricted, never embedded or searched, kept until you delete it.
- The owner is alerted by email through `notifications`, with the sender's address as Reply-To, so you answer from your mailbox.
- New requests are in the Studio Inbox under **Contact requests**; **Done** marks one handled.

The add-on depends on `notifications`, `studio` and `unified-inbox`. Configure the alert recipient and transport through `notifications`. To reword the form, add a `form` entry with id `contact`: it changes the words and fields, never the path.

## Quizzes

The `quiz` add-on serves quizzes you define as `form` entries that target `quiz-result`. There are no built-in quizzes.

```yaml
add:
  - quiz
```

- A quiz is a form with `choice` or `choices` questions and optional `scoring`: dimensions with outcomes, where each option counts toward an outcome. Each dimension's highest-scoring outcome is its result, shown on the thanks page.
- Each quiz taken is a restricted `quiz-result` entry, filed under its quiz, with the questions and answers as the taker saw them and the results as shown. Later edits to the quiz do not change it.
- A quiz may ask for `name` and `email`. A result whose taker left an email is a to-do in the Studio Inbox under **Quiz results**; every result is listed in Studio, by quiz.

## Forms

A `form` entry (from the `form` capability, in the `site` bundle) defines a public form on the site. Its frontmatter is the definition, its body the introduction and its id the form's. The package that owns the form's `target` type serves it, so a form needs a target add-on such as `contact` or `quiz`.

```markdown
---
target: contact-request
path: /work-with-us
title: Work with us
submitLabel: Send
steps:
  - title: You
    fields:
      - { kind: text, id: name, label: Name, required: true, maxLength: 120 }
      - { kind: email, id: email, label: Email, required: true }
  - title: Your plans
    fields:
      - kind: longText
        id: message
        label: What do you have in mind?
        required: true
thanks:
  title: Thank you
  body: We will be in touch.
---

Tell us what you have in mind.
```

- A form without a `path` is served at `/forms/<id>`; its thanks page is `<path>/thanks`.
- Field kinds are `text`, `email`, `longText`, `choice` (radio buttons) and `choices` (checkboxes, with an optional `max`).
- `notify` controls whether a submission emails the owner; `limits` sets this form's own admission limits over the add-on's.
- `translations` serves the form in other languages at `/<lang>/<path>`. Copy may name the site's owner as `{owner}`.
- A form added or changed in Studio is served without a restart, and its pages are built with the site.

A definition the engine would not run is refused when it is saved. See the [Entity Types Reference](./entity-types-reference.md#site-forms) for the field list.

## Related docs

- [Studio](./studio.md)
- [brain.yaml Reference](../packages/brain-cli/docs/brain-yaml-reference.md)
- [ATProto Lexicons](./atproto-lexicons.md)
- [Content Management](./content-management.md)
