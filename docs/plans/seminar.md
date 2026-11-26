# Plan: Seminar — one brain that reads Karl, Friedrich and Sigmund together

## Status

Not started. The three book brains it reads with are live on `0.2.0-alpha.765` (see [books.md](./books.md)): `friedrich.rizom.ai` (26 books, 3,705 sections), `karl.rizom.ai` (117 books, 5,576 sections) and `sigmund.rizom.ai` (207 books, 3,249 sections), each answering as its author, in the first person, citing book and siglum or page. No brain has them as approved peers yet, so a question asked of the network does not reach them: on 26 November `network_ask` from `yeehaa.io` on resentment went to two other brains and neither held anything on it.

## Goal

A fleet brain `suspicion` at `suspicion.rizom.ai` that puts one question to Marx, Nietzsche and Freud at once and keeps the result as a session: each author's answer under his name, quoted from his own German and cited to his brain's section, and a short account of where the three meet and part. Its site shows every session as one page, the three answers side by side.

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

A per-brain setting `askAllApproved` on `agent-discovery` makes `network_ask` ask every approved peer, capped at `MAX_ASKED_PEERS`, whatever the match. It is off by default, so no other brain's routing changes. `suspicion` sets it in `users/suspicion.yaml`. It serves live questions in chat and over A2A; sessions ask the peers themselves (below).

### The `seminar` plugin: sessions

`entities/seminar` (`@brains/seminar`), one entity type `seminar-session`, catalog member `seminar` in `packages/brain-cli/src/model/canonical-brain.ts`, selected with `add: [seminar]`. It follows `@brains/book`: the entity package owns the type, its templates and its datasource; the site package supplies routes, layout and `entityDisplay`.

A session is `brain-data/seminar-session/<slug>.md`:

- frontmatter: `question`, `asked` (date), `status` (`draft` | `published`), `answers` — per peer its `agent` (domain), `brain` (name and url) and `sources` (title, url, excerpt) as the peer returned them — and `unanswered`, per peer that failed, its `agent` and the reason
- body: each answer under `## <brain name>`, the peer's text verbatim, then `## Where they meet`

The owner starts a session in Studio chat with the tool `seminar_session` (anchor only). It asks every approved peer in parallel through `a2aAskContract`, the path `network_ask` uses, and writes their replies verbatim: no model turn stands between a peer's answer and the page, so a quote or a citation on a session page is exactly what that author's brain said. A generation job then writes `Where they meet` from the three answers and the seminar's notes, citing only sources the answers carry. The session stays `draft` until the owner publishes it in Studio.

Entity type config: `actionPolicy` `never` for update of the answers — a session is re-asked, not edited; the synthesis may be regenerated. The seminar site marks `seminar-session` and `note` citable, so a chat answer can cite a session or a note, and through a session the authors' sections it links to.

### The seminar site

`sites/seminar` (`@rizom/site-seminar`), with templates in `@brains/seminar`. A mockup comes first, in `docs/`, as [friedrich-reading-site-mockups.html](../friedrich-reading-site-mockups.html) did for the books.

- `/` — the sessions, newest first: the question, the date, and the three names
- `/sessions/<slug>` — the question over three columns, Marx, Nietzsche and Freud in a fixed order; each column the author's answer with its quotes linking to the section on his brain; an author whose brain did not answer says so in his column; `Where they meet` below the columns. On a phone the columns stack in the same order.
- `/notes/<slug>` — the seminar's notes, linked from the sessions that draw on them
- every page names the three brains and links to their sites

Interface in English; quotes keep the authors' German (`lang="de"`). Theme `@rizom/theme-books`, so a reader who follows a quote into `karl.`, `friedrich.` or `sigmund.rizom.ai` stays in the same paper and ink; it keeps the default theme's token names, so the seminar's templates need no theme of their own.

### Character

- name: Seminar
- role: a reading seminar on Marx, Nietzsche and Freud
- instructions: put every question to the three with `network_ask`; give each author's answer under his name, with his quotes and sources as his brain returned them, never rephrased into one voice; then say in a short paragraph where they meet and where they part, drawing on the seminar's notes and sessions; never add a quote or a citation the peers did not return; say plainly when an author's brain had nothing; answer in the reader's language.

### What the seminar's notes hold

Public `note` entries, written from the research of 26 November and each citing its sources:

- **The school of suspicion** — Ricoeur's naming of the three (Freud and Philosophy, Yale 1970, p. 32) and Foucault's "Nietzsche, Freud, Marx" (Royaumont 1964, Cahiers de Royaumont 1967), in short quotes.
- **What they knew of each other** — Freud on Nietzsche (GW X, 53; GW XIV, 86; GW XV, 79) and on Marxism (GW XV, 191–195), Nietzsche on socialism (MA 473) and his silence on Marx, Marx's 1844 "Uebermenschen"; each linked to the section on the brain that holds it.
- **Four shared themes** — consciousness not master in its own house, religion, morality as genealogy, the hidden economy beneath appearance; one note each, with one passage per author linked to his brain's section.
- **Who read them together** — Marcuse, Fromm, Assoun, Deleuze and Guattari, Leiter: titles and claims, no extracts.

The notes and sessions give the seminar its topics and agent-card skills, so a brain asking about Marx and Freud on religion finds `suspicion`, not only each author separately.

## Phases

Each phase ships on its own PR, tests first.

### Phase 1 — every approved peer, when the brain asks for it

- `askAllApproved` in the `agent-discovery` config schema, default false
- `choosePeers` takes it: when on, every approved peer, sorted as now, at most `MAX_ASKED_PEERS`
- tests: on, three approved peers and a question matching none of them, all three asked; off, unchanged

### Phase 2 — `@brains/seminar`

- schema, adapter, entity type config, `seminar` catalog member
- `seminar_session`: asks every approved peer, writes the session as `draft`; tests against recorded peer replies: three answers kept verbatim with their sources, a failing peer recorded as unanswered, a second session on the same question gets its own slug
- the `Where they meet` job; test that it cites only sources the answers carry
- templates and datasource for the session list and the session page

### Phase 3 — `@rizom/site-seminar`

- mockup in `docs/`: the session list and a session page, desktop and phone, from the four questions of 26 November
- routes, layout and `entityDisplay`; theme `@rizom/theme-books`
- release

### Phase 4 — content

- the notes above, staged locally and checked against the three brains: every linked section exists and holds the quoted words
- anchor profile, brain character, site info

### Phase 5 — fleet

- `users/suspicion.yaml` (organization kinds, `siteOverride` with `@rizom/site-seminar` and `@rizom/theme-books`, `askAllApproved: true`, Discord off, setup email `yeehaa@rizom.ai`) and its cohort in rizom-ai/rover-pilot; `onboard`, content committed to the content repo
- `agent_connect` to `karl.rizom.ai`, `friedrich.rizom.ai` and `sigmund.rizom.ai`, approved in Studio
- the first four sessions: what religion is, whether consciousness is master of itself, where morality comes from, what each knew of the others; read, then published

### Phase 6 — verify

- `https://suspicion.rizom.ai/health/ready` is 200 and its agent card names the seminar and its skills
- each of the four session pages shows three answers, and every quote links to a section that holds it
- the same four questions in Studio chat: each answer reaches all three, gives each author under his name, and every cited section is among the sources his brain returned
- from `yeehaa.io`: `agent_call` to `suspicion.rizom.ai`, then `agent_connect` and `network_ask`, timing each

## Risks

- **Two hops and one budget.** `network_ask` gives each peer one budget, 30 seconds by default (`plugins.a2a.networkAskTimeoutMs`), and a brain's answer takes 15–25 seconds on the fleet. A brain asking `suspicion` that way waits for the seminar's turn and its three peers' turns, which run in parallel, inside that budget, and will often time out. `agent_call` is the path Phase 6 must show working; Phase 6 also times `network_ask` from `yeehaa.io`, and if it times out, `yeehaa.io` raises its own budget. Sessions are not affected: `suspicion` sets its own budget for the peers it asks.
- **Citations not among the sources.** Karl (Deutsche Ideologie p. 46) and Sigmund (GW II/III, 283) each cited a page their search had not returned on 26 November. A session keeps such a citation verbatim and puts it next to two others, which makes it visible. Sessions are published only after the owner has read them; a citation that fails Phase 6 goes back to the book plugin's instructions.
- **Retrieval misses the obvious work.** Friedrich answered on morality without the Genealogie der Moral. A session shows what each brain finds, not what it should have found; better retrieval belongs to the book brains.
- **Cost.** A session is three peer turns and one generation; a live question is four model turns. Studio and A2A use the owner's provider budget; public Ask waits for its own budget controls.
