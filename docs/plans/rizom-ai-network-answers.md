# Plan: The network answers on rizom.ai

## Status

Planned on `work/network-answers`, 2026-10-01. The mockup in [`docs/design/rizom-ai-network-answers/home.html`](../design/rizom-ai-network-answers/home.html) is the visual contract: the live homepage's shell, opening and drawing with the Ask box in place of the door, and the answer sequence drawn from the connected brains' published pieces. Its answer copy and excerpts are placeholders; the brains are the live directory's.

All six slices are built and stacked: #482 (the page listens), #484 (one connected brain, indexed), #485 (the network), #486 (records name their page), #492 (asked before, with the lights), #493 (desktop beside, phone above). Slices 2 and 3 were verified on the rizom-ai test app against Yeehaa's live repository: 32 pieces indexed on the worker's start-up run, the DID learned from the brain's home, the pieces returned by scoped and broad search with brain, origin and excerpt. Slice 5 was verified there in headless Chromium at 1440 and 390 wide with two seeded published FAQs: the chapter after "Where this goes", the open question lighting Yeehaa in both drawings, "Rizom, with Yeehaa" and the excerpt under it, the organism stepped aside. The test app now composes the faq plugin, as production's chat bundle does.

## Goal

The rizom.ai homepage draws the live network of brains and offers an Ask box, and today the two have nothing to do with each other: the box answers from the Rizom brain's own content, the drawing is scenery beside it. On yeehaa.io the atlas and the box share one vocabulary — an answer's sources light the marks they came from — and the page is stronger for it.

Here the vocabulary is brains. A visitor's question is answered by Rizom from what the connected brains have published, every cited piece carries the brain it came from, and the drawing shows whose memory answered: the replying brains light, the rest dim, the answer names them and links each source to its origin with a line in the owner's own words. Visitors' questions the owner keeps become "Asked before", and an asked-before question answers at once, with no model call.

## Baseline

- A brain with publishing credentials has an ATProto DID and a repository, and the atproto plugin mirrors each public entity of a projected type to a record there on every update (post, deck, project, note, link, series, topic, social post; the brain card always). Nothing restricted or private is mirrored. rizom.ai is the lexicon authority. On 2026-10-02 only yeehaa.io of the nine connected brains resolves an ATProto handle; the `*.rizom.ai` brains have no identity until the fleet provisions one.
- Only the post lexicon has a `canonicalUrl`, and no live record carries one: a record does not say where its page is.
- The connected brains' cards reach Rizom through the agent directory (`entities/agent-discovery`), which carries each brain's A2A endpoint as its URL and feeds the homepage drawing (`sites/rizom-ai/src/story/network.ts`). A brain discovered by its card has no repository DID in the directory; the DID arrives only through the brain-card firehose.
- Guest Ask answers from Rizom's entities; the sources are the citable types' results within a score band (`shell/core/src/initialization/guest-answer-sources.ts`). When no type opts in, every type with pages is citable. The box emits `ask:sources` with `{ id, title }` per source (`shared/contracts/src/ask-box.ts`, `interfaces/web-chat/ui-react/src/guest-box.tsx`).
- The atlas kit (`shared/site-atlas`) already lights marks from `ask:sources`, draws leads, and docks the map into the phone conversation (`homepage-atlas-script.ts`). The rizom.ai opening hosts the box through the kit's `AskBoxHost` and draws the network itself.
- FAQs (`entities/faq`) capture a visitor's question and the reply as a public draft, fold repeats by embedding distance and count them, reach the owner in Studio and the Inbox, and publish. The kit renders published FAQs as "Asked before": a closed `details` accordion, one open at a time, most asked first, no script.
- The A2A interface (`interfaces/a2a`) can put a message to a connected brain as an agent, which runs that brain's model on its owner's account.
- Guest Ask is off on production rizom.ai; the test app runs it with the `local-test` preset.

## Decisions

- **Index, never fan out.** Rizom reads the connected brains' repositories and keeps their public pieces as its own entities; a question costs one model call, as today, bounded by the existing guest budget. A live question to another brain through A2A multiplies cost onto other owners' accounts and is not part of this plan.
- **Consent is publication.** A brain is in the network's answers exactly when its owner has published pieces to its repository; withdrawing a piece withdraws it from Rizom's answers at the next sync. No further switch.
- **One entity type, `network-piece`,** with the kind as a field. Stored as Rizom's own types, another brain's work would get rizom.ai routes, a place in Studio and the writing archive, and be re-published under Rizom's DID, none of it switchable per entity. A `network-piece` is public, embeddable, searchable and citable, and nothing else: no site route, `projectionSource: false`, read-only in Studio; its citation URL points to the origin brain.
- **The sync lives in `agent-discovery`,** which owns the directory and its cadence; the piece sits beside the agent.
- **A brain's repository is learned from its home.** An approved agent without a DID is asked at `https://<home>/.well-known/atproto-did` once per sync and the DID is kept on the agent; the directory does not wait for the firehose.
- **A piece is sent to its page, else to its brain's home.** The origin is the record's `canonicalUrl`; without one it is the site the brain's endpoint belongs to, never the endpoint. The brain names its page in the record (slice 4), so an answer's rows deep-link once the brains republish.
- **The answer is Rizom's; the words are theirs.** The model composes one answer across the pieces; every source carries the brain, the origin link and an excerpt — the record's opening lines — so the composition and the words behind it are both on the page.
- **The brain rides on the source event.** `ask:sources` gains an optional `brain` per source (`{ did, name, url }`); the professional site ignores it, the rizom.ai opening lights by it.
- **An asked-before question answers before the model.** Guest Ask puts the question to the faq plugin over a shell channel; the plugin matches it against published public FAQs with the same-question matching the capture already uses (embedding distance, then the one confirming check); a hit returns the FAQ's answer and its stored sources, counts another ask, and the box says "Asked before". Drafts never answer.
- **A withdrawn source is the owner's call.** When a cited piece leaves the index, the published FAQs that cited it are marked for review and reach the Inbox with what left; the owner keeps the answer or takes it down. Nothing is unpublished for them.
- **"Asked before" is the chapter after "Where this goes",** before "Two ways in": the reader has seen the argument and has their own doubts before being asked to choose a door. The chapter draws the live network again beside its questions, the organism steps aside while it is read, and the open question lights the brains its answer drew on in every drawing. Counts sort the section and are never shown; the suggestions under the box stay the owner's openers from the Ask note.
- **No lights without a cited piece.** A spark means a published piece from that brain was cited; the attribution line says what happened — Rizom answered, with their memory.

## Slices

Each slice ships on its own, with its tests, and is verified on the rizom-ai test app in headless Chromium before the next.

### 1. The page listens

`ask:sources` carries `brain` per source (contract, guest transcript, box). The opening's script lights the drawing from it: a source without a brain or from Rizom lights the center; a brain's source lights its dot and thread with the drawing's own echo and spark, the rest dim, chips name the repliers in arrival order; the answer's attribution line and per-source rows follow the text, each row linking to its origin. Pointing from a row, a name or a dot lights all three. Nothing federated yet: Rizom's own pieces exercise the whole path.

Tests: the contract's schema accepts and omits `brain`; the transcript emits it; the opening script, run from its shipped text in happy-dom like the story runtime, lights and dims the right nodes for a sources event and leaves the drawing at rest for an answer without sources.

### 2. One connected brain, indexed

The `network-piece` entity (schema, adapter, read-only Studio presence) and the sync in `agent-discovery`: for one connected agent with a DID, resolve the PDS, list the projected collections with cursors, upsert pieces keyed `did/collection/rkey` with the brain, kind, origin URL, excerpt and record time, delete the ones gone, keep the last index when the PDS is unreachable. Rizom's Ask cites the pieces like its own; the citation links to the origin brain; the event names the brain; the dot lights.

Tests: the adapter round-trips a record; the sync upserts, leaves unchanged records untouched, deletes withdrawn ones and survives an unreachable PDS; a guest answer's sources carry the brain; a `network-piece` builds no site route and is never projected.

### 3. The network

Every connected brain with a DID is indexed on the directory's cadence; consultation is bounded by relevance, not by brain. The embedding cost is once per new or changed piece. The attribution line, the chips and the rows read as in the mockup for one, two or three brains.

Tests: a directory of several brains indexes all and only the published pieces; a question whose pieces come from two brains lights two.

### 4. Records name their page

Every projected record carries the entity's page address as `canonicalUrl`: the lexicons other than post gain the optional field, the atproto plugin hands each projection the page URL it already knows for the site, and each projection writes it. A brain's next publish of a piece gives it an address; the index picks it up by cid and the citation deep-links.

Tests: each lexicon accepts and omits `canonicalUrl`; each projection writes the page URL it is handed and nothing when there is none; the plugin hands the URL only for entities with a page.

### 5. Asked before, with the lights

A FAQ stores its sources (brain, piece, excerpt, origin) at capture. Guest Ask checks a question against published FAQs before the model; a hit answers from the FAQ, counts the ask, and emits the same sources event, with the status "Asked before". The "Asked before" chapter joins the rizom.ai story after "Where this goes", from the kit's FAQ template with the chapter's own styling; opening a question lights its brains in the drawing and shows its attribution, rows and excerpts. A FAQ whose cited piece has left the index goes to the Inbox for review.

Tests: the FAQ schema carries sources; a matched question answers without the model and counts; the chapter renders published FAQs most asked first with no counts; the script lights the drawing for an open question and lets go on close.

### 6. Desktop beside, phone above

The drawing belongs to the page while an answer is open: beside the conversation on desktop with a dotted lead from each row to its brain, and the strip above the conversation on a phone, where a tap on a lit dot brings its row into view. Both lifted from the atlas kit's script. Reduced motion keeps the lit states and drops the sparks, echoes and leads.

Tests: the script's lead geometry and dock behaviour, as the atlas tests pin them; headless Chromium at 1440 and 390 wide on the test app.

## Not in this plan

- Live questions to connected brains through A2A, and any answer composed of other brains' own replies.
- Network pieces in the owner's Studio chat; they answer the public Ask only.
- Switching guest Ask on for production rizom.ai: the owner's cost decision, made separately. The slices are verified on the test app.

## Related plans

- [`public-ask.md`](./public-ask.md): the guest Ask, its budget and the professional atlas it first landed on.
- [`atproto-integration.md`](./atproto-integration.md): the records and lexicons the index reads.
- [`cross-brain-entity-sharing.md`](./cross-brain-entity-sharing.md): sharing between brains by other means; the index here reads only what is public.
