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

- Studio Chat is limited to Trusted and Admin actors;
- anonymous visitors chat only through guest Ask, and only while the owner has it switched on;
- when guest policy does not apply, `/ask` redirects to Studio Chat (or returns `404` without Studio).

## Owner-switched guest chat

With guest configuration omitted, the runtime derives its origins from deployment
context: the site itself and, when it has its own host, its preview. One switch,
one monthly budget and one set of limits cover both. Guest chat stays off until
the owner switches it on in Studio with a monthly budget. Existing `guest: false`
blocks this; `guest: local-test` remains a separate loopback-only test convention.

On the authenticated site origin, `GET /api/chat/guest/access` reports the
switch, budget and this month's charges without invoking a model. `POST` accepts
only `{"enabled":true}` or `{"enabled":false}`, requires an Admin browser session
and a same-origin JSON request, and cannot override the origins, limits or
accounting. Switching on reuses the budget last set in Studio.

Each answer is charged what it measurably cost, or a fixed cap when that cannot
be measured; the budget starts over on the 1st (UTC). Background generation and
indexing are accounted separately.

Only declared guest routes and their presentation assets are served; each host
accepts guest requests only from its own pages. Management and other APIs stay
excluded on preview. Guest credentials are HttpOnly cookies; optional
conversation locators use sessionStorage, not transcript storage. Closing a tab
can lose its locators; this is not automatic credential or locator recovery.

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
model judges it against the site's scope: the brain's public topic titles,
which the topics plugin answers on `topics:public-titles`, and the
`ask-content` introduction. A question that is
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
