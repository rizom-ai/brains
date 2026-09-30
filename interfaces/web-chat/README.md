# Web chat interface

`@brains/web-chat` provides the guest-facing Web Chat surface at `/ask` and
owns the shared Chat HTTP APIs. Native authenticated Chat is hosted by Studio
at `/chat`; the two presentations share the transport contract without sharing
browser components. Web Chat has no operator browser app. Paths that previously
served it redirect with `303` to Studio's `/chat`, which owns authentication;
without Studio they return `404`. Guest-origin Ask remains a guest surface even
for signed-in owners.

## Public boundary

`@rizom/brain/chat` owns the supported browser-safe domain schemas, paths, and
fetch-injected transport client. This package's route handlers and standalone
transport consume that canonical contract. The React application, AI SDK
adapters, query cache, active-conversation state, routing, browser storage,
copy, and styles remain private Web Chat presentation logic and are not
re-exported from `@rizom/brain`.

## Audience boundary

The current release remains fail-closed:

- Studio Chat is limited to Trusted and Admin actors;
- when guest policy does not apply, `/ask` redirects to Studio Chat (or returns `404` without Studio);
- active Public and unauthenticated callers have no Chat access.

The intended future split is Studio for authenticated actors, with a separately
restricted Public policy, and standalone Web Chat for explicitly enabled
anonymous guests. Neither `public: true` nor preview route reachability grants
guest access. It must remain disabled until guest identity, capability,
rate, abuse, spend, retention, consent, deletion, and kill-switch policies are
accepted and enforced server-side.

## Bounded preview authorization

With guest configuration omitted, the runtime derives the preview origin from
deployment context and reuses shared guest bounds. It stays off until an
administrator explicitly authorizes access. Existing `guest: false` blocks this
activation; `guest: local-test` remains a separate loopback-only test convention.

On the authenticated primary origin, `GET /api/chat/guest/access` reports the
proposed allowance and current usage without granting access or invoking a model.
`POST` accepts only `{"enabled":true}` or `{"enabled":false}`, requires an Admin
browser session and same-origin JSON request, and cannot override the origin,
limits or accounting. This is an operator HTTP action, not an Ops/YAML setting.

The current shared bounds authorize at most **two messages and $4 total** across
all visitors and time. Authorization and lifetime reservations are durable in the
existing CAS ledger. Failures, cleanup, retries, restart and disable/re-enable do
not refund or replenish them. An exhausted allowance cannot be renewed through
this action. Background generation/indexing is accounted separately.

Only declared guest routes and their presentation assets are served on preview.
Management and other APIs stay excluded there; primary-host guest requests remain
denied. Owned history and deletion remain available after exhaustion. Guest
credentials are HttpOnly cookies; optional conversation locators use sessionStorage,
not transcript storage. Closing a tab can lose its locators; this is not automatic
credential or locator recovery. Production guest access requires separate work
and approval.

## Public page composition

The installed site owns `/ask` chrome. After guest admission, Web Chat returns a
`SitePageResponse`: Webserver can serve the generated page at the same path from
that host's active site output, retaining the handler's cache policy. Denials,
redirects and ordinary authenticated responses never delegate to site output.
Apps without a generated Ask page retain a headerless standalone fallback.

The site page mounts the shared guest app using `data-web-chat-root`,
`data-guest-chat` and `data-chat-api-path="/api/chat/guest"`, plus the existing
`/ask/assets/ask.js`, `ask.css` and scoped `page.css`. The site's own layout and
runtime supply navigation, fonts, theme switching and footer. This does not
change guest API admission or authorize production-page publication.

## Authored Ask content and the dashboard tab

The `ask-content` singleton is the shared source of welcome copy and suggested
questions for `/ask`, the Brain-page box and the dashboard. Its markdown body is
the introduction; optional `title` and `topics` frontmatter provide the heading
and editable topic buttons. Store it at `ask-content/ask-content.md` in the
content directory, with `visibility: public`. Missing, private or malformed
content produces no welcome or topics. It is not a system prompt or policy.

Each guest question is screened before it is answered: one call on the guest
model judges it against the `topics` as the site's scope. A question that is
off topic, abusive, an injection attempt or harmful gets the optional
`refusal` line instead of an answer, or a neutral line when the site wrote
none. The Studio guest chat monitor counts screened-out questions by
category, and answers given unscreened because the judgment failed.

The guest bootstrap response delivers this bounded presentation after the
existing admission checks. Privacy, provider, retention and expiry information
still come from runtime policy. No host page supplies fallback chat copy.

An owner can show the public dashboard tab with:

```yaml
plugins:
  dashboard:
    ask: true
```

This setting defaults to false and requires Web Chat to be installed. It only
controls visibility: it does not enable guest access or replenish limits. The
shared Web Chat UI mounts once when the tab is first selected; switching tabs
preserves its draft and conversation. Full Ask uses the existing same-origin
owned locator and never replays a question on navigation.

Existing Brain-page `hero.chat` copy is no longer consumed. Move approved welcome
and topics into the dedicated entity before publishing the new presentation;
do not copy old privacy or retention text into authored welcome content. No
automatic migration, generated welcome or hosted content write is performed.

## Build

`bun run build` invokes `scripts/build-ui.ts`, which owns the browser target, ESM output, minification, source maps, React deduplication, and compile-time StyleX extraction through `Bun.build`. It emits only the three guest bundles: `guest`, `ask`, and `dashboard`, each with JavaScript and static CSS. The build removes stale `app.js`/`app.css` outputs; those operator asset routes are no longer registered. Web Chat has no second Vite build path.

Buttons, fields, selects, dialogs, and menus reuse `@brains/app-ui-react`, the same token-driven control vocabulary as Studio. Web Chat keeps its conversation-specific composition and AI elements local.

## State ownership

Guest conversation, history, send and recovery state remain in `GuestApp` and
its guest hooks. Credentials and locators follow the boundaries above; guest
access never becomes an operator session. Studio owns operator browser state,
including session selection, uploads, approvals, rename, archive and confirmed
permanent deletion. Both use the existing Web Chat API and conversation service.

## Inbox conversations

Studio owns the **Chat** interaction and universal Inbox **Discuss in chat**
follow-up, registered only when web-chat is installed. The follow-up opens an
actor-owned context session at `/chat`; the bounded source locator remains
inspectable after reload. Web Chat re-authorizes source detail on each request,
frames it as untrusted transient context, and never persists or returns the
source body. Browser-supplied `inboxContext` is rejected by the request schema.

The old one-shot prefill and its detach button are intentionally retired.
Inbox-linked conversations retain their item; start a new conversation for a
different topic. This changes no Inbox item and grants no new guest capability.
