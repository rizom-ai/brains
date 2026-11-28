# Plan: Studio UX overhaul

Last updated: 2026-11-28

## Status

**In progress; Chat everywhere and palette actions next.** Phase 0 shipped in #1057: it fixed the nine defects the walkthrough found (rows and destinations as links, per-page tab titles, the system color scheme, an activity feed that survives restarts and names entries by title, leftover frontmatter in previews, and three copy faults). Phase 1, the writing loop, shipped in #1064. Two of its items moved to phase 5: Draft as the default status and requirements held until publish both depend on the lifecycle declarations that phase adds. Until then a new post still asks for its status, excerpt and author, and names an empty one as required. Phase 2, lists and links, shipped in #1065. Phase 3, navigation, shipped in #1066 without its collections item, which followed in two steps: series onto Groups in #1070 and collections in #1075. That item assumed every collection names the member field that points at it, but only series does: a topic's members live in the topics plugin's own records, and nothing points at a project. It was redesigned on 2026-11-27 (see Decisions) and now comes in two steps after phase 3. The findings below describe Studio before those fixes. The direction, the mockups and the decisions below were agreed on 2026-11-26. This plan comes from a walkthrough of the running `publishing` test app on `0.2.0-alpha.772`: I signed in with a fresh passkey and captured every Studio area at 1440×900 and 390×844, then exercised create, edit, preview, Chat and the ⌘K palette. Where a finding names behavior, I checked it in the browser and traced it to the source.

The [mockups](./studio-ux-overhaul-mockups.html) show Home, writing, creating, asking while writing, a collection, the ⌘K palette, the Publish board and the phone layouts, in light and dark.

This plan replaces the earlier Studio follow-through plan, which is deleted. Its open work carries over: the draft-recovery decision (now decided below), manual accessibility acceptance, and release-candidate verification with a working AI provider and configured site-launch URLs (both under Validation).

## Diagnosis

Studio is organized around how the brain is built, not around what an operator comes to do. Navigation mirrors entity registrations and plugin workspaces. The editor mirrors the stored file: file name, slug, frontmatter fields, then body. Status text mirrors the pipeline ("entity db → exported to file", "Debounce 5000 ms", "0 in working tree").

Each surface is careful and well tested on its own terms. The combined effect is a tool where:

- the home page reports system churn instead of what needs me;
- writing happens in the narrowest column on the screen;
- publishing is a field in a form, not an action;
- Chat, which knows the content best, is walled off from the content;
- the palette promises commands and runs none.

The operator jobs Studio should be organized around are:

1. **Respond:** see what needs me and clear it (inbox, failures, invitations, review queue).
2. **Browse and write:** find, capture, draft and refine content.
3. **Publish:** move drafts to the site and channels, and see what went out.
4. **Ask:** talk to the brain about my content and have it act.
5. **Tend:** shape the brain's identity, skills, agents, people and infrastructure.

## Findings by journey

### 1. Arriving: Overview

**What happens**

- The 24-hour timeline is a 1,240px band. On a brain that has just woken, every event sits in the last column and the other 23 hours are empty.
- "What happened" is a raw event log. Most of it is machine churn ("Skill deleted", "Skill updated"), with duplicates. It names some items by title ("Create Technical Publishing Assets") and others by id ("shape-urban-technology-infrastructure", "typescript-type-design").
- The feed lives in process memory (`private activity` in `plugins/studio/src/overview-workspace.ts:435`). Restarting the app dropped it from 71 events to 2.
- The right column is six disclosures of mostly zeros: Invitations 0/0, Inbox 0/0, Action items 0/0, Traffic 0/0, Pipeline 0/0/0. Healthy zeros and attention zeros look the same.
- "Site health: published / published" doesn't say whether anything is wrong.
- On a phone the attention column comes after the whole event log. The page is 5,684px tall, so what needs me sits below roughly 4,000px of history.
- Overview has no way to start anything: no new entry, no ask box, no "continue".

**Proposed change**

- Rebuild Overview as **Home**, with three bands in this order at every width:
  - **Needs you:** only nonzero, actionable items, each with its verb (Review 2 drafts, Retry failed build, 1 invitation expiring). When there are none, show a single line saying so.
  - **Continue:** my most recently edited drafts and unfinished conversations.
  - **Recently published:** what went out, and where.
- Add a capture/ask composer at the top. It creates a note, or opens Chat with the text.
- Move the event log to a durable **History** page under Brain. It should use titles, collapse batches ("Regenerated 4 skills") and survive restarts, sourced from the job queue and entity updates rather than process memory.
- Drop the 24-hour band, or make it zoom to the active window. An empty band carries no information.
- Turn System/Brain status into one line that appears only when something is wrong.

### 2. Finding my way: navigation

**What happens**

- Desktop uses three navigation columns: the rail (124px), the area leaf (220px), then content. Content starts at 344px, before the editor's own Properties column.
- There are six areas with decorative ordinals (00–05): Overview, Chat, Library, Work, Admin, System. Clicking Library, Work or System opens a leaf without navigating. The page underneath stays on the previous destination (Library leaf over Overview content).
- Library lists 17 types in registration order. Nine are empty: Ask Content, Refined Notes, References, Forms, Newsletters, Decisions, Action Items, FAQs, Series. Ask Content shows no count at all.
- The groupings are inconsistent with the names:
  - "Collections" (Topics, Series, Projects) is a hardcoded name list in `ui-react/src/studio-areas.ts` that includes plural spellings (`project`/`projects`, `swot`/`swots`).
  - Site Content sits in Library while Site Info sits in System → Site.
  - Work mixes attention (Inbox), pipeline (Publishing), infrastructure (Content sync, Site), analytics (Traffic) and monitoring (Guest chat).
- "Studio" appears twice: in the header breadcrumb ("ALEX CHEN / STUDIO") and again as the rail heading.
- Every navigation target is a `<button>`. Library rows (`studio-library-pane.tsx:396`, `:415`) and group member rows (`studio-groupings.tsx:324`) are also buttons. Only group value rows are links. Nothing in a list can be opened in a new tab, middle-clicked or copied as a link.
- The browser tab title is "Content Studio" on every route (`plugins/studio/src/editor-shell.ts:54`). Tabs and history entries can't be told apart.

**Proposed change**

- Use one sidebar with five fixed sections: **Home, Library, Publish, Chat, Brain**.
  - Home opens the landing page directly; its only sub-pages are Inbox and the action board.
  - Library holds content types, their folders and groups.
  - Publish holds the pipeline board, Site, channels and Traffic.
  - Brain holds identity, intelligence, agents, people/admin, content sync and history.
  - Plugins place their pages through the [contribution model](#contribution-model), not through Studio code.
- Drop the second column. Within a section, types and groups are collapsible lists in the same sidebar.
- Remove the ordinals.
- Inside Library, keep each type's folder trail, scoped search and New-in-folder as they work today. Order types by recent use, show empty types only under **All types**, and use the type's own icon. Sidebar width collapses to icons while editing (see 3).
- Derive "collection" behavior from registration metadata (a type that other entries reference as a container), not from a name list.
- Make every destination and every list row a real `<a href>` with client-side interception. Open-in-new-tab, copy link and middle-click then work everywhere.
- Set `document.title` per route: "Event Sourcing for Sustainability Metrics — Posts — Alex Chen".

### 3. Writing: the editor

**What happens**

- On a 1440px screen, the post body gets about 700px. In Split mode it's about 340px each for source and preview, because the rail, Library leaf and Properties (346px) all stay open.
- Properties come first. A Note's Properties column spends 346px on one Visibility field.
- The title is shown twice: once as the page H1 (not editable) and again as the Title field. In Preview, a body that starts with `# Title` shows it a third time.
- The editor opens in Preview, not in a writable state.
- On a phone, the body sits below the whole Properties form. Writing means scrolling past Title, Slug, Status, Published At, Excerpt and Author.
- Status is a plain `<select>` (Draft, Queued, Published, …). Changing it to Published edits a field; it doesn't publish anything.
- The footer holds "Saved", a "Sync details" disclosure with pipeline stations ("entity db → exported to file → …") and Delete.
- Drafts live only in memory, so a reload or crash loses unsaved work. The previous plan left this as an open decision.
- ⌘S saves (`studio-editor-pane.tsx:106`), but nothing in the UI says so.

**Proposed change**

- **Focus layout:** opening an entry collapses the sidebar to icons and gives the document the center. Properties become a right-hand **inspector** that can be collapsed and remembers its state per type.
- **Title is the document heading** and is edited in place. The separate Title field goes.
- Hide a body H1 that repeats the title in Preview, or warn about it.
- Open existing entries in **Source with live formatting** (CodeMirror Markdown decorations), with Preview one key away. Split becomes a wide-screen option, not a default tab.
- On a phone, open on the body. Properties move into a bottom sheet behind a "Details" button.
- Replace the status select with a **state control in the header**:
  - Draft → **Publish** (or **Queue / Schedule** where a pipeline exists);
  - Published → **Unpublish / Update**.
  - The pipeline owns the transition; the status field is read-only in the inspector.
- Footer: one quiet line ("Saved 2 min ago · synced to files"). Sync stations move into the inspector's "Technical" disclosure. Delete moves to a ⋯ menu in the header.
- **Draft recovery:** keep unsaved changes in the browser, per person, per brain and per entry, as decided below. On reopen, a banner offers "Restore unsaved changes from 14:02?" with Restore and Discard.
- Show keyboard hints (⌘S, ⌘K, ⌘\ to toggle the inspector) in a "?" overlay.

### 4. Creating: new entries

**What happens**

- **New post** first asks for **File name** ("Names the file inside this folder: letters, numbers and hyphens…"), then Title, then Slug. That's three identity fields for one post.
- Status starts at "—" and is required. Excerpt, Author and Published At are required or shown before a word is written.
- The footer reads "Not created yetName the file to create this entry." Two spans render with no separator (`studio-editor-save-bar.tsx:69`).
- Create stays disabled with no visible reason next to it. The reason sits in the footer.

**Proposed change**

- Creation starts from **Title and body only**. The file name and slug come from the title, and the destination preview stays visible as a small "Saves as `post/event-sourcing.md`" line that can be edited under "Address".
- Status defaults to **Draft**. Required-for-publish fields (Excerpt, Author, Published At) are required only when publishing, and say so at the Publish control. "Summarize body" offers to fill Excerpt at that point.
- Show blocked-save reasons next to the action, and give each message its own line.
- Let a quick capture (Home composer, palette "New note", or Chat "save this") create an entry without opening the full form.

### 5. Browsing: collections and lists

**What happens**

- Library rows show an ordinal, title, a status word and a relative time. All three posts read "Published · 2 minutes ago", which is the import time, not when they were written or published.
- Rows have no excerpt, cover image, series, topic or author, so there's little to tell entries apart before opening one.
- System lists (Prompts, Skills, Agents) use a different grammar: tall ~95px rows, a redundant "Prompt ·" prefix and an arrow. Twenty prompts take more than two screens.
- Topics, Series and Projects are labeled Collections, but their editors show only a title and body. A topic doesn't list the posts in it.
- "Untitled" appears as a real note title in the list.
- The seed's two image entries can't be reached anywhere: `/studio/api/types` returns no image type, so there's no media library.

**Proposed change**

- Use one row grammar for every type, with schema-declared columns: title, then an excerpt line, a status chip (Draft / Queued / Published / Failed), the **meaningful date** (published date for published entries, updated otherwise) and a thumbnail when the type has a cover.
- Add a density toggle: comfortable (with excerpt) or compact (table).
- Give container types a **Members** section on the entry, and in the list ("12 posts"), using the same hierarchy/grouping query that Groups already uses.
- Add an **Images** view: a thumbnail grid with upload, alt text and "used in" references.
- For untitled entries, fall back to the first line of the body, then the date.

### 6. Publishing

**What happens**

- Publishing shows "5 published" and "Nothing is in flight. Queue a draft to start a publication run." There's nothing on the page to queue with, no drafts list and no list of what was published.
- Site shows build diagnostics as primary content ("Debounce 5000 ms", "Default environment preview", "preview · skipped — Site inputs were unchanged"). It has no picture of the site itself.
- Content sync is a Git panel ("2 retained", "Imported: 1 · Exported: 0", "0 in working tree") under Work.

**Proposed change**

- Make Publish a **board**: Drafts → Queued/Scheduled → Published (with destinations: site, LinkedIn, newsletter) → Failed. Cards open the editor, and queuing or scheduling is a drag or a button on the card.
- Add a calendar view for scheduled and published items.
- Site leads with a live **preview thumbnail** (iframe or screenshot), with Open preview / Publish to production as the two actions and the last change summarized in words. Build logs and automation settings go under "Technical".
- Content sync moves to Brain → Storage. It surfaces only when something fails, through Home.

### 7. Asking: Chat

**What happens**

- A new conversation opens on "No messages yet. Your draft stays in the composer until you send it." It suggests nothing and gives no hint of what the brain can do.
- An answer that names "Event Sourcing for Sustainability Metrics" quotes it as plain text. The entry is reachable only by expanding "Retrieved sources".
- Chat is a separate destination. I can't ask about the document I'm editing without leaving it, and leaving it puts my draft behind a navigation guard.

**Proposed change**

- Add a **docked Chat panel** that can be opened from any page (⌘J) and carries the current context ("About: Event Sourcing for Sustainability Metrics"). The full-page Chat stays for long sessions.
- Turn entity mentions in answers into links that open the entry, and show sources inline as chips.
- Fill the empty state with starter actions drawn from installed capabilities (summarize this week's inbox, draft a post from my notes on X, what did I publish last month).
- Offer "Apply to document" when an answer proposes text for the open entry, going through the existing approval flow.

### 8. The palette and language

**What happens**

- The ⌘K field says "Search or run a command…". Typing "new" returns the Newsletters page and five agents/playbooks that match loosely ("Brand Scout", "Old Agent"). There's no command to run.
- Every result carries a "studio" pill. Topic results show ids ("sustainability-data-systems").
- Internal vocabulary reaches the surface: "Anchor profile" (Account, `account/account-tabs.tsx:84`), "climate" (the ◑ theme toggle's label), "entity db", "working tree", "retained", "Ask Content".
- The Groupings empty state says "Define a label, its types, and whether…", but definitions have no type selection (`studio-grouping-definitions-editor.tsx:179`).
- The Inbox empty state says "Nothing needs attention for these filters. Change Source or Urgency…" even when both filters are at All (`plugins/unified-inbox/src/operator-studio.ts:394`).

**Proposed change**

- Give the palette three sections:
  - **Actions:** New <type>, Ask the brain, Build preview, Publish…, Sync now, Invite someone, Toggle theme, collected from the same declared workspace actions.
  - **Go to:** areas, types and workspaces.
  - **Content:** entries by title, ranked by recency.
- Remove the source pill when there's only one source.
- Do a copy pass: "Your profile" for Anchor profile; "Light / Dark" for climate; "Saved · synced to files" for the station chain; "Site pages" for Site/Ask Content, or hide Ask Content where it isn't authored by hand.
- Fix the Groupings copy, and give Inbox a true all-clear state when the filters are at their defaults.

### 9. Platform behavior

**What happens**

- With the OS in dark mode, Studio renders light. The climate script reads only a stored choice or the server default, never `prefers-color-scheme` (`shared/console-theme/src/climate-script.ts`). DESIGN.md names dark as the designed default.
- Overview has 160 buttons on desktop. Heavy disclosure use keeps state behind clicks and makes screen-reader navigation long.
- The previous plan's manual accessibility acceptance is still open: screen-reader announcements, focus restoration, obscured content and dialog isolation.

**Proposed change**

- Follow `prefers-color-scheme` until the person chooses, and label the toggle Light / Dark / System.
- Expand Home's needs-you items by default, and leave healthy items out rather than collapsing them.
- Carry the manual accessibility acceptance into each phase's validation, not into a final pass.

## Contribution model

The redesign has to stay as extensible as today's Studio: plugins contribute without shipping browser code, and the host renders everything from a closed declarative vocabulary. What changes is that placement stops being hardcoded in Studio.

**What is hardcoded today**

- `studioArea()` in `ui-react/src/studio-areas.ts` puts every plugin workspace in Work. Overview, Chat, Administration and Account are special-cased by id.
- Library versus System comes from `classification`. Collections and Site are separated by type-name lists (`project`/`projects`, `site-info`, …).
- Attention reaches the shell only as a count per workspace.

**The frame**

The five sections (Home, Library, Publish, Chat, Brain) are fixed by the host. Plugins cannot add a section. A plugin that needs its own space gets a page inside the section that matches its job, so navigation stays the same shape however many plugins a brain installs.

**Placement**

- `defineStudioWorkspace()` takes `section: "home" | "library" | "publish" | "chat" | "brain"`. Omitting it places the page in Brain, so nothing disappears.
- Administration declares `section: "brain"` like any other registrant and loses its id special case. Overview becomes the built-in Home page, and Chat stays the built-in Chat page.
- Entity types keep using `classification`: content types appear in Library, system types in Brain. Collection behavior needs a new registration field: a type such as topic, series or project declares that it collects entries, and which field of the member types references it. That replaces the name lists. It's separate from `containedIn`, which stays the structural relationship used by book sections.

| Registrant       | Page             | Section |
| ---------------- | ---------------- | ------- |
| unified-inbox    | Inbox            | Home    |
| action-board     | Board            | Home    |
| content-pipeline | Publishing board | Publish |
| site-builder     | Site             | Publish |
| analytics        | Traffic          | Publish |
| web-chat         | Guest chat       | Chat    |
| linkedin-import  | LinkedIn import  | Library |
| directory-sync   | Content sync     | Brain   |
| admin            | Administration   | Brain   |

**Contribution points the host renders**

- **Attention items.** A workspace contributes items with a title, detail, severity and the declared action that clears them, alongside today's count. Home's Needs you is built from these, filtered by the viewer's permission. The count still drives the sidebar light.
- **Actions in ⌘K.** The palette collects the typed actions workspaces already declare, filtered by permission and grouped under their page. Actions about the open entry come from what its type can do (publish, ask, refine).
- **Lifecycle.** An entity type can declare its states and the transitions its owning plugin runs. The host draws the path of lights and the primary transition button from that declaration. content-pipeline declares it for posts, social posts and newsletters; action-board for action items. Types without a lifecycle show no path.
- **Board block.** A kanban becomes a declarative block: columns, cards and move actions that map to declared actions. action-board's board and the Publish board both render through it, and any plugin can use it without new renderer code.
- **Destinations.** The editor's "Where it goes" toggles come from the publishing plugin's destinations for that type, not from schema fields.
- **Chat context.** The docked Chat panel passes the open entry as context through the existing chat handoff contract.

Providers still own data, permission narrowing and action execution. The host still owns authentication, transport, navigation, validation, rendering, accessibility, URLs and confirmation.

## Phasing

Each phase is one PR that ships something usable end to end, with its tests and the visual/axe matrix updated in the same PR.

1. **Writing loop** (shipped, #1064). Focus layout, title-as-heading, inspector, phone body-first, title-only creation with derived address, footer cleanup, Source opened first with live formatting, and draft recovery as decided below, including the schema marker for secret fields.
2. **Lists and links** (shipped, #1065). One row grammar with schema columns (`studioColumn` field metadata; covers from the adapter), meaningful dates, excerpts, status words, a Compact toggle, and an Images view with upload, alt text and "used in".
3. **Navigation** (shipped, #1066). The five fixed sections in one sidebar, `section` on workspace registrations (Brain when none is named), Administration's special case removed, Home and Chat listing their other pages, Library's types in use most recent first, and empty types under All types.
   - **3a. Series onto Groups** (shipped, #1070). A post's series is a one-value group, so putting a post in a series works like any group and Studio shows its members and counts. A post's place in its series is derived from publication date, then creation for drafts; no number is stored. yeehaa.io's content was converted on 2026-11-28, after its brain moved to alpha.791: 20 posts in three series, each keeping its order.
   - **3b. Collections and container members** (shipped, #1075). An opened series or topic lists its entries, and its row says how many it holds. A series reads its members through its Series group; a topic's plugin answers `collectionMembersContract` from extraction's votes. Which types are collections comes from registrations, so projects are no longer one and the name list is gone. Library lists its types as one list, as the mockups show.
4. **Home** (shipped, #1076). Home replaces Overview. It opens on a sentence that says how much needs you and a box that saves a note or asks Chat; Ask leaves the question in a new conversation's composer. Below are Needs you (attention items, failures first, each with its verb), Continue (recent drafts and conversations) and Recently published. The brain's health is one line, with History one click away. Workspaces contribute attention through `attentionProvider` or a declarative `attention`; the inbox and Administration provide theirs, and a plugin that does keeps its widget out of Needs you. History, under Brain, keeps a week, with repeated saves and runs of one change collapsed. Inbox and Board have been under Home since phase 3.
5. **Publish board** (shipped, #1077). Publishing is one board on the `matrix` block: Drafts → Queued → Published → Failed, each card moved by its button or dragged to the next column (queue a draft, send a queued entry back, retry a failure). Cards show type and destination; a draft shows what it still needs. A type's `publish` declaration names `requiredFields` (posts: excerpt and author); content-pipeline refuses to queue or publish until they are filled, and Studio starts a new entry of a publishable type as a draft with those fields left empty rather than required. The stored schema is unchanged, so posts already written read as before. The status field is read-only where a publishing workspace moves it. Site leads with how the preview stands against the live site and Build preview / Publish site, with build details under Technical. Content sync was already under Brain.
   - **Left from phase 5.** The calendar and per-entry scheduling: the pipeline schedules per type (cron) and nothing sets a per-entry time yet. A general lifecycle declaration: the board uses content-pipeline's declared publication actions directly. A site thumbnail, which needs an image or frame block the view vocabulary does not have.
6. **Chat everywhere and palette actions.** Docked panel with page context, linked mentions, starters, apply-to-document, palette Actions section.

## Decisions

Decided:

- **Navigation model:** five sections (Home, Library, Publish, Chat, Brain) replace the six areas and the leaf column.
- **Extensibility:** the host fixes the sections; plugins declare which section their pages belong to and cannot add sections.
- **First section:** called Home, not Today, because Inbox and the Board are not about one day. Clicking Home opens the landing page; it keeps its daily summary sentence.
- **Status as action:** the status field is read-only in the editor; status changes only through the Publish/Queue control, which the owning plugin's lifecycle runs.
- **Derived address:** a new entry's file name and slug come from its title and show as an editable "Saves as" line. A taken name is reported on that line, never renamed silently. Retitling after the first save leaves the address unchanged, since there is no move or rename.
- **Collections (2026-11-27):** membership a person chooses is a group on the member; membership the brain works out is answered by the owning plugin. Series moves onto Groups with its order derived from publication date; topics answer through their plugin; projects stop being a collection.
- **Draft recovery:** unsaved edits are kept in this browser only, per person, per brain and per entry, and never synced. They are cleared on a successful save, on Discard, on logout and after 7 days. Fields that hold credentials are never stored; a schema marker for secret fields is added for this.

## Boundaries

- Authorization, persistence, search, conflict detection and the pinned content hash stay server-owned, as today.
- Declarative workspaces keep the closed host-rendered vocabulary. New contribution points (section, attention items, lifecycle, board block, destinations) extend that vocabulary; none accepts browser code. Home stays a host composition, as Overview is now.
- No change to stored Markdown or entity schemas is implied by the presentation work. Hiding a repeated H1 and stripping body frontmatter in Preview are presentation-only.

## Validation

- Mounted UI tests and editor workflow tests for each changed flow, written before the change.
- The `bun run visual:console --surface-prefix=studio- --a11y` matrix at desktop, tablet and phone in both themes, reviewing changed captures before `--update`.
- A running-app walkthrough on the canonical `publishing` app per phase, covering create → publish → see on preview and the phone writing flow, with the site rebuilt through the running app before inspecting output.
- Manual screen-reader and focus checks for the editor, Home and the docked Chat panel, plus the accessibility audit's outstanding manual items: announcements, focus order and restoration, obscured content, dialog background isolation and the contrast cases axe marks incomplete.
- Release-candidate verification with a working AI provider and configured site-launch URLs. Placeholder credentials exercise failure recovery, not successful AI turns, and local QA is not deployed-fleet acceptance.
