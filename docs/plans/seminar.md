# Plan: Seminar — one brain that reads Karl, Friedrich and Sigmund together

## Status

Not started. The three book brains it reads with are live on `0.2.0-alpha.765` (see [books.md](./books.md)): `friedrich.rizom.ai` (26 books, 3,705 sections), `karl.rizom.ai` (117 books, 5,576 sections) and `sigmund.rizom.ai` (207 books, 3,249 sections), each answering as its author, in the first person, citing book and siglum or page. No brain has them as approved peers yet, so a question asked of the network does not reach them: on 26 November `network_ask` from `yeehaa.io` on resentment went to two other brains and neither held anything on it.

## Goal

A fleet brain `suspicion` at `suspicion.rizom.ai` that puts one question to Marx, Nietzsche and Freud and keeps the exchange as a session: their openings, the seminar's challenge, their answers to each other and a rejoinder, each author quoting his own German and cited to his brain's section, and a short account of where the three meet and part. Its site shows every session as one page, read top to bottom.

| Brain       | Holds                                                            | Domain               | Content repo                       |
| ----------- | ---------------------------------------------------------------- | -------------------- | ---------------------------------- |
| `suspicion` | sessions, notes comparing the three, the three as approved peers | `suspicion.rizom.ai` | `rizom-ai/rover-suspicion-content` |
| `karl`      | Marx's works (unchanged)                                         | `karl.rizom.ai`      | `rizom-ai/rover-karl-content`      |
| `friedrich` | Nietzsche's works (unchanged)                                    | `friedrich.rizom.ai` | `rizom-ai/rover-friedrich-content` |
| `sigmund`   | Freud's works (unchanged)                                        | `sigmund.rizom.ai`   | `rizom-ai/rover-sigmund-content`   |

For Rizom it is the smallest working case of a network that grows by connection rather than concentration: four brains, each holding its own sources, none holding the others' texts, and one question answered across them with every claim attributed to the brain that made it. Every session page shows that without a visitor asking anything, so the site works before public Ask opens. A brain that connects to `suspicion` reaches all three through one connection.

## Non-goals

- No books in `suspicion`. It holds no author's text; quotes come from the three brains' answers and link to their sections.
- No voice of its own author. It is a seminar, not Ricoeur: Ricoeur's and Foucault's works are in copyright, so it cites them briefly as secondary sources and never speaks as either.
- No public Ask before [public-ask.md](./public-ask.md) opens guest admission in production. Sessions are started by the owner; live questions come from Studio and over A2A.
- No sessions started by visitors or by other brains. A question from another brain is answered, not saved.
- No changes to the three book brains' content or character.

## Decisions

### An organization brain with its own site

`suspicion` is `profileKind: organization` and `anchorKind: organization`, like `hub`: it is no person, and the fleet's `team` bundle, which serves human members writing together, is not what it needs. Bundles `core, web, chat, site`, with `addOverride: [seminar]`. The generic organization site would show an introduction, a radar of three peers and topic pages, and nothing of a session, so the brain gets a site of its own, as the book brains do.

### The three are asked every time

`choosePeers` (`entities/agent-discovery/src/lib/network-ask.ts`) asks the approved peers whose skills share enough words with the question, at most three, and the two nearest when none match. The book brains' skills are titled by theme ("Analyze Political Struggle", "Trace the Genealogy of Values"), so most questions would reach one or two of them, and a seminar that sometimes leaves one author out answers a different question.

A setting `askAllApproved` on the `agents` capability, beside `notifyOnNewAgents`, makes `network_ask` ask every approved peer, nearest first, capped at `MAX_ASKED_PEERS`, whatever the match. It is off by default, so no other brain's routing changes. The tool's description states the routing in force, so the model is not told "the best matches" on a brain that asks them all. `suspicion` sets it under `plugins.agents` in `users/suspicion.yaml`. It serves live questions in chat and over A2A; sessions ask the peers themselves (below).

### A session turn has its own contract

`a2aAskContract` is shaped for a visitor's question: `networkAskMessage` (`interfaces/a2a/src/message-handlers.ts`) appends "Asked on behalf of a visitor to another brain's site. Answer briefly", the question is capped at 4,000 characters, and the budget is `networkAskTimeoutMs`. A challenge carries an opening and a rejoinder carries two challenges, so sessions use a contract of their own, `a2aTurnContract` in `shared/contracts/src/a2a.ts`, answered by the A2A interface beside the ask handler:

- request: `agent` and `message`, up to 32,000 characters, sent as written
- response: `a2aPeerAnswerSchema`, as an ask returns
- saved, approved peers only; one attempt; budget `plugins.a2a.turnTimeoutMs`, default 90 seconds
- a timeout or refusal is an error with its reason, which the job records on the turn

`network_ask` keeps `a2aAskContract` unchanged. No tool is added: the contract is a bus message between the session job and the A2A interface, and a peer receives an ordinary A2A message.

### The `seminar` plugin: sessions

`entities/seminar` (`@brains/seminar`), one entity type `seminar-session`, catalog member `seminar` in `packages/brain-cli/src/model/canonical-brain.ts`, selected with `add: [seminar]`. It follows `@brains/book`: the entity package owns the type, its templates and its datasource; the site package supplies routes, layout and `entityDisplay`.

A session is an exchange, not three answers side by side. Mockup: [seminar-session-mockup.html](../seminar-session-mockup.html), built from the three brains' real replies of 26 November.

1. **Openings** — the question goes to every approved peer at once.
2. **The seminar's turn** — it reads the openings against its notes and decides who stands and who answers: the author whose opening holds, and the others who must answer him. To each challenger it puts one follow-up that names the claim to answer and a work of his own to answer from. It never quotes for him; his brain finds and quotes the passage. A brain that lacks the work says so, and the draft shows it.
3. **Challenges** — the challengers answer, at once, each given the opening he must answer.
4. **Rejoinder** — the author who stood is given the challenges and answers both.
5. **Where they meet** — the seminar's closing paragraph, citing only sources the turns carry.

On 26 November, asked what a community should remember and forget, Nietzsche alone answered the question; pointed to the Achtzehnte Brumaire and Der Mann Moses, Marx and Freud answered him from them, and Nietzsche answered both from the three kinds of history.

A session is `brain-data/seminar-session/<slug>.md`:

- frontmatter: `question`, `asked` (date), `status` (`draft` | `published`), and `turns`, in order — per turn its `round` (`opening` | `challenge` | `rejoinder`), its `speaker` (a peer's `agent` and `brain`, or `seminar`), `answers` (the agents it addresses), its `text` — a peer's verbatim, the seminar's follow-ups as written — and for a peer its `sources` as `SourceCitationSchema` holds them, or for a failed peer the reason
- body: `Where they meet`

A peer's text is a frontmatter value, not a section of the body, so a heading inside an answer cannot split a turn.

The owner starts a session in Studio chat with the tool `seminar_session` (anchor only); it runs as a job, a minute or two. Peers are asked through `a2aTurnContract`, and their replies are written verbatim: no model turn stands between a peer's answer and the page, so a quote or a citation on a session page is exactly what that author's brain said. The session stays `draft` until the owner publishes it in Studio. A session costs about eight model turns: six peer turns and the seminar's two generations.

Entity type config: `actionPolicy` `create: never`, `update: never`, `publish: admin`. A session is written only by its job and never edited. `seminar_session` takes a `question` for a new session, or a `session` and `from` (`seminar-turn` | `closing`) to redo an existing draft from that step; openings are never redone, a new session re-asks them. The seminar site marks `seminar-session` and `note` citable, so a chat answer can cite a session or a note, and through a session the authors' sections it links to.

### Language is stated, never inferred

Every message the seminar puts to a peer ends with the same two lines: "Answer from your own works and cite each section you draw on. Answer in English; keep the quotes in German." The turn contract adds nothing after them. Its follow-ups are full of German quotes and titles, and a book brain told only to answer "in the reader's language" reads that from the whole message: on 26 November Karl once answered such a follow-up in German, and twice in English when it was sent again; with the line added he answered in English. The book plugin's instructions gain the same rule for every caller: answer in the language of the question's own sentences; quoted German does not make a question German.

### The seminar site

`sites/seminar` (`@rizom/site-seminar`), with templates in `@brains/seminar`.

- `/` — the sessions, newest first: the question, the date, and the three names
- `/sessions/<slug>` — the question, then the exchange read top to bottom: the openings in three columns, Marx, Nietzsche and Freud in a fixed order; the seminar's turn as a marked aside naming whom it asks and what; the challenges in columns, each marked with whom it answers; the rejoinder; then `Where they meet`. Every quote links to the section on its author's brain; an author whose brain did not answer says so. On a phone the columns stack in reading order.
- `/notes/<slug>` — the seminar's notes, linked from the sessions that draw on them
- `/ask` — the question box, as on the books site: shown only while guest chat is available on the brain, so it is absent until public Ask opens. A visitor's question gets the live answer, the three authors side by side and where they meet; it is not saved as a session.
- every page names the three brains and links to their sites

Interface in English; quotes keep the authors' German (`lang="de"`). Theme `@rizom/theme-books`, so a reader who follows a quote into `karl.`, `friedrich.` or `sigmund.rizom.ai` stays in the same paper and ink; it keeps the default theme's token names, so the seminar's templates need no theme of their own.

### Character

- name: Suspicion
- role: a reading seminar on Marx, Nietzsche and Freud
- instructions: put every question to the three with `network_ask`; give each author's answer under his name, with his quotes and sources as his brain returned them, never rephrased into one voice; then say in a short paragraph where they meet and where they part, drawing on the seminar's notes and sessions; never add a quote or a citation the peers did not return; say plainly when an author's brain had nothing; never point an author to what his brain lacks: Nietzsche's Nachlass notebooks and letters, Marx's New-York Daily Tribune articles, Freud's letters; answer in the reader's language.

### What the seminar's notes hold

Public `note` entries, written from the research of 26 November and each citing its sources:

- **The school of suspicion** — Ricoeur's naming of the three (Freud and Philosophy, Yale 1970, p. 32) and Foucault's "Nietzsche, Freud, Marx" (Royaumont 1964, Cahiers de Royaumont 1967), in short quotes.
- **What they knew of each other** — Freud on Nietzsche (GW X, 53; GW XIV, 86; GW XV, 79) and on Marxism (GW XV, 191–195), Nietzsche on socialism (MA 473) and his silence on Marx, Marx's 1844 "Uebermenschen"; each linked to the section on the brain that holds it.
- **Four shared themes** — consciousness not master in its own house, religion, morality as genealogy, the hidden economy beneath appearance; one note each, with one passage per author linked to his brain's section.
- **Who read them together** — Marcuse, Fromm, Assoun, Deleuze and Guattari, Leiter: titles and claims, no extracts.

The notes and sessions give the seminar its topics and agent-card skills, so a brain asking about Marx and Freud on religion finds `suspicion`, not only each author separately.

## Phases

Three PRs in this repository: the seminar plugin (Phases 1–3 as commits on one PR), live questions (Phase 4) and the site (Phase 5). Tests first.

### Phase 1 — a session of openings

- `a2aTurnContract` and its handler; tests: the message is sent as written, a message longer than an ask allows is accepted, a timeout is an error with its reason
- `@brains/seminar`: schema, adapter, entity type config, `seminar` catalog member, a plain session page
- `seminar_session` and its job: the question to every approved peer, each opening written verbatim with its sources, the session saved as `draft`
- tests against recorded peer replies: turns kept verbatim, an answer with headings round-trips, every message ends with the two closing lines, a failed peer is recorded and the session goes on without him
- a `seminar` test app in `packages/brain-cli/test-apps/` with the three live brains saved and approved as its peers; one real session of three openings

### Phase 2 — the exchange

- the seminar's turn, challenges and rejoinder
- tests, the 26 November session among them: the challengers are given the opening they answer and the rejoinder is given the challenges; a peer failing at any round is recorded and the session goes on without him
- one real session, the full exchange, on the test app

### Phase 3 — where they meet, redo, publish

- the closing, citing only sources the turns carry
- redo from `seminar-turn` or `closing`
- tests: `Where they meet` cites only sources the turns carry; with `update: never` the owner still publishes in Studio and no turn can be edited
- templates and datasource for the session list and the session page

### Phase 4 — live questions

- `askAllApproved` in the `agents` capability's config schema, default false
- `choosePeers` takes it: when on, every approved peer, nearest first, at most `MAX_ASKED_PEERS`; the tool's description follows it
- tests: on, three approved peers and a question matching none of them, all three asked; off, unchanged
- the book plugin's language rule in `BOOK_INSTRUCTIONS` (`entities/book/src/plugin.ts`)

### Phase 5 — `@rizom/site-seminar`

- mockup in `docs/`: the session list, and the session page on a phone, next to the session page in [seminar-session-mockup.html](../seminar-session-mockup.html)
- routes including `/ask`, layout and `entityDisplay`; theme `@rizom/theme-books`
- the package's first publish to npm, then its release after core

### Phase 6 — content

- the notes above, staged locally and checked against the three brains: every linked section exists and holds the quoted words
- anchor profile, brain character, site info

### Phase 7 — fleet

- the books cohort moves to the release that carries the language rule, with its image locks
- `users/suspicion.yaml` (organization kinds, `siteOverride` with `@rizom/site-seminar` and `@rizom/theme-books` and their `version` and `themeVersion` pins, `plugins.agents.askAllApproved: true`, `plugins.a2a.turnTimeoutMs`, Discord off, setup email `yeehaa@rizom.ai`) and its cohort in rizom-ai/rover-pilot; `onboard`, content committed to the content repo
- `agent_connect` to `karl.rizom.ai`, `friedrich.rizom.ai` and `sigmund.rizom.ai`, approved in Studio
- the first sessions: what a community should remember and forget, what religion is, whether consciousness is master of itself, where morality comes from; read, then published

### Phase 8 — verify

- `https://suspicion.rizom.ai/health/ready` is 200 and its agent card names the seminar and its skills
- each session page shows the full exchange, every peer turn in the reader's language, and every quote links to a section that holds it
- `/ask` is absent while public Ask is closed
- the same four questions in Studio chat: each answer reaches all three, gives each author under his name, and every cited section is among the sources his brain returned
- from `yeehaa.io`: `agent_call` to `suspicion.rizom.ai`, then `agent_connect` and `network_ask`, timing each

## Risks

- **Two hops and one budget.** `network_ask` gives each peer one budget, 30 seconds by default (`plugins.a2a.networkAskTimeoutMs`), and a brain's answer takes 15–25 seconds on the fleet. A brain asking `suspicion` that way waits for the seminar's turn and its three peers' turns, which run in parallel, inside that budget, and will often time out. `agent_call` is the path Phase 8 must show working; Phase 8 also times `network_ask` from `yeehaa.io`, and if it times out, `yeehaa.io` raises its own budget. Sessions are not affected: a turn has its own budget.
- **Citations not among the sources.** Karl (Deutsche Ideologie p. 46) and Sigmund (GW II/III, 283) each cited a page their search had not returned on 26 November. A session keeps such a citation verbatim and puts it next to two others, which makes it visible. Sessions are published only after the owner has read them; a citation that fails Phase 8 goes back to the book plugin's instructions.
- **Editions guessed.** Asked the same question twice, Karl dated his Brumaire once "first German edition, 1852" and once "first German edition, 1869; pp. 6–7", though 1869 is the second edition and his sources carry no pages. The edition is in each book's frontmatter; a book brain that cites one it did not read there is a book plugin fix, found by the same Phase 8 check.
- **Retrieval misses the obvious work.** Friedrich answered on morality without the Genealogie der Moral; Marx and Freud first answered on memory without the Brumaire and Der Mann Moses. The seminar's follow-up points a brain to its own work, named from the seminar's own knowledge of the author, which found both; where a brain lacks the work it says so and the owner sees it in the draft; an opening still shows only what each brain finds, and better retrieval belongs to the book brains.
- **The seminar steers.** Choosing who stands and naming the work to answer from shapes the exchange. The page shows every follow-up as the seminar wrote it, so a reader sees the steering; the seminar never supplies an author's words.
- **Cost.** A session is about eight model turns; a live question is four. Studio and A2A use the owner's provider budget; public Ask waits for its own budget controls.
