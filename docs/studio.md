# Studio

Studio is the brain's signed-in workspace in the browser. It is where you read and edit the brain's content, triage what needs you, publish, chat with the brain and manage its settings and people. It is part of the `web` bundle and is served at `/studio` (Chat at `/chat`).

This page describes what Studio shows. For how content is stored and synced, see [Content Management](./content-management.md).

## Signing in and roles

Studio has no passwords. People sign in at `/login` with a passkey:

- The first Admin registers a passkey through the one-time `/setup` link a new brain prints on first boot (see [Interface Setup](./interface-setup.md#http-mcp)).
- Everyone else is invited from **Brain → Administration → Invitations** and registers a passkey from the invitation link.

Any signed-in person can open Studio, but what they see depends on their role:

| Role    | What Studio shows                                                                                                                                        |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public  | Only **Account**: profile, sign-in and sessions, linked identities.                                                                                      |
| Trusted | Home, Library, Publish, Chat and Brain, with the pages Trusted people may use, and Account. Entries are shown at Trusted visibility (public and shared). |
| Admin   | Everything, including restricted entries and the Admin-only pages: Inbox, Guest chat, Traffic, Content sync and Administration.                          |

On a personal brain the owner is also the **Anchor**, the person the brain speaks for. A few pages, such as **LinkedIn** in Library, appear only to the Anchor.

## The five sections

Studio's sidebar has five fixed sections: **Home**, **Library**, **Publish**, **Chat** and **Brain**. A section appears only when an installed plugin puts something in it, and a section's count is the number of things in it that wait for you. Library, Publish and Brain open in place, so you can browse their lists without leaving the page you are on. On a phone the same sections are in the **Browse** sheet.

**Account** is not a section; open it from your name in the header. ⌘K (Ctrl+K) opens a palette that jumps to any page or collection you may open.

### Home

Home is the page Studio opens on (Trusted and Admin). It starts with one sentence that says how much needs you, and a box where you write something down: **Save as note** saves it as a note, and **Ask** sends it to Chat.

Below that are three bands:

- **Needs you** lists only what waits, each item with the action that clears it, such as **Open inbox** or **Review invitations**.
- **Continue** brings back recent drafts and Chat conversations.
- **Recently published** lists what went out.

The brain's health is one line at the bottom, linking to History.

Other pages in Home:

- **Inbox** (Admin): see [The Inbox](#the-inbox).
- **Board** (Trusted, with the `action-board` add-on): the team's action items from conversations, by where they stand.

### Library

Library holds the brain's content: notes, links, posts, decks, documents and every other content type a plugin installs. It lists the types that hold something, the ones you opened most recently first. Types with no entries yet are under **All types**.

- A collection type, such as a series or a topic, lists its members when opened, and its row says how many it holds ("12 posts").
- **Images** is a grid of the brain's images, each marked when it has no alt text. Opening one shows its title and alt text to edit and the entries that use it. Images can be uploaded there.
- **Groups** appear when the brain defines groupings (see [Brain](#brain)). Each group lists its values and the entries that carry each one, across types.
- **LinkedIn** (Anchor only, with the `linkedin-import` add-on) fills the Anchor profile from LinkedIn; see [Publishing Integrations](./publishing-integrations.md#linkedin-profile-import).

Opening an entry shows it as a document with its properties beside it:

- The title is the heading, edited in place. A new entry's file is named after its title, shown as "Saves as …" with a **Change** link.
- Entries open in **Source**; **Preview** renders them. Properties fold away with Ctrl/⌘+\ and `?` lists the editor's shortcuts.
- Ctrl/⌘+S saves. Unsaved edits are kept in this browser for a week, per person and entry, and are offered back after a reload; fields that hold credentials are never kept.
- A save made over a version that changed in the meantime does not overwrite it. The edit is kept as a conflict, which you can apply or dismiss from the editor and which Admins also see in the Inbox.

In a collection whose entries can be combined (notes into a refined note), pick rows by their number and choose **Refine**. Studio asks the brain to write one refined entry from them and says when it is written; the picked entries are removed.

### Publish

Publish holds the pages that get content out. Which ones appear depends on the bundles and add-ons installed.

**Publishing** (Trusted, with `content-pipeline`) is a board with four columns: **Drafts**, **Queued**, **Published** and **Failed**. A card moves on by its button or by dragging it to the next column: a draft is queued, a queued entry goes back to drafts, and a failure is retried. **Publish now** publishes an entry at once, after a confirmation. Each card shows its type and destination; a draft shows what it still needs, and a publication shows when it went out.

A new entry of a publishable type starts as a draft. Studio asks only for what the entry needs to exist (for a post, its title and body); fields needed to publish are left empty until you fill them. A type can name the fields it needs before it publishes. Posts need an excerpt and an author, and the pipeline refuses to queue or publish a post without them, saying what to add ("Add excerpt and author before publishing."). For types the board handles, the status field in the editor is read-only: the board moves it.

**Site** (Trusted, with `site-builder`) leads with one sentence on how the preview stands against the live site, links to **Open preview** and **Open live site**, and two actions:

- **Build preview** (Trusted) rebuilds the preview site, which includes drafts.
- **Publish site** (Admin) builds and publishes the production site, after a confirmation. Production includes only published entries.

Build details, routes and automation follow under **Technical**.

**Traffic** (Admin, with `analytics` and Cloudflare configured) shows the last 7, 30 or 90 days of site traffic; see [Publishing Integrations](./publishing-integrations.md#site-analytics).

### Chat

**Chat** (Trusted) is the brain's own chat in Studio, at `/chat`. It needs `web-chat` (the `chat` bundle).

- A new conversation offers up to four ways to start, drawn from what the brain has: its inbox, its publishing, its posts and notes. Choosing one fills the composer; nothing is sent until you send it.
- An answer that names an entry it drew on links that name to the entry in Studio, and its sources are chips that open each entry. A source from another brain opens on that brain.
- Actions the brain proposes, such as saving or changing an entry, wait for your approval in the conversation.
- **History** lists past conversations. A conversation can be renamed, archived or deleted.

**Guest chat** (Admin) controls the public Ask surface; see [Guest Ask](#guest-ask).

### Brain

Brain holds the brain's own records and settings, grouped by what they are for:

- **Structure**: **Groupings**, one document that defines groups (such as Clients or Projects) every content type can carry. Admin-only to edit.
- **Identity**: **Anchor Profile** (who the brain speaks for), **Brain Character** (its role and purpose) and **Style Guide** (its voice and visual rules).
- **Intelligence**: prompts, skills, playbooks and SWOT assessments.
- **Network**: the agents (peer brains) this brain knows; see [Agent Discovery](./agent-discovery.md).
- **Site**: the site's own records, such as site info and settings.

Pages in Brain:

- **Content sync** (Admin): the state of directory sync and git, recorded issues, and **Sync now**.
- **Administration** (Admin), with three tabs:
  - **People**: everyone with access, their role, connected channels and status, and the brain's relationships with peer brains.
  - **Invitations**: **Add a person** invites someone as Admin or Trusted. Pending and past invitations are listed, with **Resend** and **Cancel**. With **Automatic** delivery the brain sends the link itself; with **Manual** delivery, copy the link the invitation shows, send it yourself and choose **Confirm delivered**.
  - **Access activity**: the access audit log.
- **History** (Trusted): what happened over the last week. Repeated saves of one entry read once, and a run of the same change reads as one line.

### Account

Account is your own account on this brain, not shared settings. Its tabs:

- **Profile**: your name and role. On a brain whose Anchor profile names you, the name follows that profile, with **Edit Anchor Profile →**.
- **Sign-in & sessions**: your passkeys and active sessions.
- **Linked identities**: how the brain recognizes messages from you, such as your chat accounts.
- **Personal settings**: per-account plugin settings, when a plugin declares them (for example the LinkedIn token for `linkedin-import`).
- **AI tools**: shown when the brain serves MCP over HTTP and your role may use it. It gives the brain's MCP address and how to connect Claude and ChatGPT.
- **Drive**: shown when the drive is on, for Trusted and Admin people. App passwords for mounting the brain as a network drive and connecting Obsidian; see [The Drive and Obsidian](./drive-and-obsidian.md).

## The Inbox

The Inbox (Admin, in Home; from `unified-inbox`, part of `core`) gathers everything that waits for a decision, from every plugin that contributes items, urgent first. It is not a second store: each item stays owned by its source, and acting on it changes the source. Filters for source and urgency stay in the page's address.

Sources include:

| Source           | Items                                                                                                                                                                                    | Actions                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Conflicts        | An edit from a Studio save, the drive, a file in `brain-data` or a git pull that was made over an older version and was not saved over the current one. The detail shows the difference. | **Apply this version** (confirms), **Keep current** |
| Action items     | Blocked action items (with `action-board`).                                                                                                                                              | **Resume**, **Done**, **Drop** (confirms)           |
| Contact requests | New contact form submissions (with `contact`).                                                                                                                                           | **Done**                                            |
| Quiz results     | Quiz results whose taker left an email (with `quiz`).                                                                                                                                    | **Done**                                            |
| Recurring checks | Alerts from the brain's scheduled checks. Each stays open until an Admin resolves it.                                                                                                    | Resolve                                             |

Other plugins add their own, such as mail (`email-workflows`) and FAQs. From an item you can also open its source entry, capture it as a note, or **Discuss in chat**. A daily digest lists open items by title. Admin MCP clients read the Inbox through `chat`, or with `inbox_list` in debug mode.

## Guest Ask

Visitors can ask the brain questions at `/ask` and, on sites that show it, from the homepage Ask box. Guest Ask stays off until an Admin switches it on in **Chat → Guest chat**:

- **Turn on guest chat** asks for a monthly budget in dollars (at least $0.05). Each answer is charged what it measurably cost, usually about a cent; the budget starts over on the 1st of each month (UTC). **Change budget** adjusts it while it is on.
- **Turn off guest chat** stops it at once, without a confirmation.
- The page shows questions and cost today and this month, screened-out questions and why, and the recent questions with their outcome and cost. **Save as note** keeps a visitor's question as a note.

Switching guest chat on or off rebuilds the site, so the Ask box appears or goes with it. Setting `plugins.web-chat.guest: false` in `brain.yaml` keeps guest chat off regardless of the switch. The welcome copy and suggested questions are the `ask-content` entry.

## The public dashboard

The dashboard is the brain's public card, at `/` on a brain without a site and at `/dashboard` on one with the `site` bundle. It shows only public data. A signed-in person who opens it goes to Studio instead; **?view=public** shows the public card from Studio's identity menu.

Its tabs are **Overview** (identity, contact points, holdings, skills), **Ask** (when `plugins.dashboard.ask` is on and Ask is served), **Knowledge**, **Network** and **System**. The **Knowledge** tab is a map of the brain's public topics: each source is a point, related sources form territories, and the largest territories are listed by source count. The map comes from the `topics` capability and shows only public entries. **Network** is a map of the agent directory.

## Related docs

- [Content Management](./content-management.md)
- [The Drive and Obsidian](./drive-and-obsidian.md)
- [Publishing Integrations and Site Add-ons](./publishing-integrations.md)
- [Interface Setup](./interface-setup.md)
- [Agent Discovery](./agent-discovery.md)
