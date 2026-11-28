# Plan: The brain inside Obsidian

## Status

Proposed.

## Background

The Rizom Brain plugin for Obsidian (`packages/obsidian-plugin`, published as `rizom-brain`) keeps a vault and a brain in step: notes, images and PDFs both ways, conflicts settled in Obsidian. That is all it does. A person who wants to ask their brain something, see what relates to the note in front of them, publish a post or capture a thought still leaves Obsidian for Studio or a chat app.

The plugin reaches the brain through the drive (`plugins/webdav`) with an app password. Besides files, the drive already answers a few calls for sync clients under `/dav/.brain/`: what changed, the brain's types, and settling a conflict. What the brain offers beyond that was read from the code on 2026-11-28:

- **Search and relatedness** are on the runtime the drive already has: `entityReads.nearestToEntity` and `entityReads.search`, both held to a visibility scope. Nothing is missing but a call.
- **Publishing** a post, deck or project by setting `status: published` in its file is a real publish for the brain's own site, and the drive already asks for the publish permission when a save crosses that line. What a file edit does not do is tell the newsletter or an external provider: only the publish action of `publishing_manage` announces `publish:completed`.
- **Capture** of a note is a file at the vault's root, which the plugin uploads like any note. Capture of a link is a job in `entities/link` no plugin may import.
- **Asking** runs through `agent.chat`, which only an interface's runtime has. The drive is a service plugin and cannot run a turn; no bus contract runs one on this brain.

## Goal

Five things, each usable on its own:

1. **File marks.** Each file in Obsidian's file list shows whether it is in step, waiting, kept local, or in conflict.
2. **Related notes.** A side panel lists the brain's entries nearest to the open note, linked or not. Choosing one opens its file.
3. **Quick capture.** A command sends a selection or a line of text to the brain as a note; a link is captured as a link entry the brain fetches and describes.
4. **Publish.** A command publishes or unpublishes the open post, deck or project, the way Studio's publish does, and its state shows in the file's mark.
5. **Ask your brain.** A side panel takes a question and shows the brain's answer with its sources; a source opens its file in the vault. A question can be about the open note.

## Non-goals

- No editing through chat. A turn asked from Obsidian reads; it changes nothing in the brain, and anything the agent would need a confirmation for is refused.
- No chat history browser. The panel holds one conversation per vault, which can be started over.
- No scheduling or queue management from Obsidian. Publish is now, or not.
- No capture of files, images or audio. Text and links.
- No related-notes graph. A list.
- Notes in folders of the person's own, and canvases, stay unsynced, as decided.

## Design

### Where the calls go

The plugin's calls stay on the drive, under `/dav/.brain/`, authenticated by the app password as every drive request is. The drive gains `POST` for paths under `.brain/` only; a `POST` anywhere else is refused as before. Every call is for sync clients (`X-Brain-Sync: 1`), acts as the person behind the app password, and reads at that person's visibility scope. A read-only app password may ask and read; it may not capture or publish.

This widens what an app password can do: it could already read and write every file its person may; it can now also ask the agent, which reads the same entries. It cannot make the agent act.

| Call                                                   | What it does                               | Brain side                                                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET .brain/related?path=…&limit=…`                    | the entries nearest to the entry at a path | `entityReads.nearestToEntity`, scoped; each result as its drive path and title                                                                           |
| `POST .brain/capture` `{ url }`                        | capture a link                             | a new contract `link:capture-request` in `@brains/contracts`, answered by `entities/link`                                                                |
| `POST .brain/publish` `{ path, action }`               | publish or unpublish an entry              | a new contract `publish:request` in `@brains/contracts`, answered by `plugins/content-pipeline` with the checks and announcements of `publishing_manage` |
| `POST .brain/ask` `{ question, path?, conversation? }` | one turn, answered with text and sources   | a new contract `agent:ask` in `@brains/contracts`, answered by `interfaces/web-chat`, which runs `agent.chat` as that person, read-only                  |

A brain without a call answers 404 or 405. The plugin then shows that feature as needing a newer brain, once, and leaves the rest working; a feature is never half-shown.

### File marks

Plugin only. The engine already knows each path's state: in step (in `state.paths` with a matching hash), waiting (changed since), local (`placementOf` says why), in conflict (`state.conflicts`). The plugin exposes that per path and decorates the file list's rows. Obsidian has no API for the file list, so the rows are found by their `data-path` and given a class; the mark is CSS. A folder shows a mark when something inside it waits or conflicts. The marks can be turned off in settings.

### Related notes

A view in the right sidebar. When the open file is a synced entry, the plugin asks `.brain/related` for its path and lists the answers by title, nearest first, each with its type. Entries the vault holds open on click; one the vault does not hold (a type it does not mirror) is shown without a link. The answer is kept per path until the file changes or ten minutes pass. Offline, the panel says so and shows the last answer.

### Quick capture

- **Text:** the command "Send to your brain" takes the selection, or asks for a line, asks for a title (the first line by default), and writes a note at the vault's root. Sync uploads it as any note. No brain change.
- **Links:** when the text is a URL, the plugin posts it to `.brain/capture`. The brain makes a pending link entry and fetches it, as a link shared in chat is; the entry arrives in the vault's `link` folder through the change feed.

### Publish

The command "Publish" on a post, deck or project calls `.brain/publish`; "Unpublish" calls it with the other action. The brain runs what `publishing_manage`'s publish runs: the entry must be public and complete, the person must hold the publish permission, the provider publishes, the entry is marked, and `publish:completed` is announced, so a newsletter or an external provider follows as from Studio. The refusal, when there is one, is the brain's sentence, shown as a notice. The changed file comes back through the change feed.

Editing `status:` by hand keeps working as it does today.

### Ask

A view in the right sidebar: a question box, the conversation above it, and "About this note" when a synced note is open.

- The plugin posts the question, the open note's path when asked about it, and the conversation id the brain gave it before.
- The drive resolves the person and sends `agent:ask`. Web Chat answers it: it runs one `agent.chat` turn as that person with interface type `obsidian`, in the named conversation or a new one, with the entry as context when a path was given.
- The turn is read-only: tools that write are not offered, and a pending confirmation is answered as declined.
- The answer is the text and the sources card: each source as its drive path, title and excerpt. The plugin renders the text as markdown and each source as a link that opens the file.
- The answer arrives whole. Web Chat's own stream delivers the text in one piece today; the panel shows that the brain is thinking, and can be cancelled.

## Phases

Each phase ships on its own, tests first, as one pull request with a plugin release.

1. **File marks.** Plugin only.
2. **Related notes.** The drive's `related` call; the panel.
3. **Quick capture.** Text capture, plugin only; then the `link:capture-request` contract, the drive's `capture` call, and link capture.
4. **Publish.** The `publish:request` contract answered by content-pipeline; the drive's `publish` call; the commands and the mark.
5. **Ask.** The `agent:ask` contract answered by Web Chat, read-only turns; the drive's `ask` call; the panel.

## Open points

- Whether a read-only turn can be had by configuration of `agent.chat`, or needs a tool filter added to it. Settled at the start of phase 5 by reading the agent service.
- Whether Obsidian's review accepts decorating the file list by its DOM. Other listed plugins do; if it is refused, marks move to the status bar and a view.
