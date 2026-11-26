# Plan: Seminar — one brain that reads Karl, Friedrich and Sigmund together

## Status

Not started. The three book brains it reads with are live on `0.2.0-alpha.765` (see [books.md](./books.md)): `friedrich.rizom.ai` (26 books, 3,705 sections), `karl.rizom.ai` (117 books, 5,576 sections) and `sigmund.rizom.ai` (207 books, 3,249 sections), each answering as its author, in the first person, citing book and siglum or page. No brain has them as approved peers yet, so a question asked of the network does not reach them: on 26 November `network_ask` from `yeehaa.io` on resentment went to two other brains and neither held anything on it.

## Goal

A fleet brain `suspicion` at `suspicion.rizom.ai` that puts one question to Marx, Nietzsche and Freud at once and sets their answers side by side, each quoted from the author's own German and cited to his brain's section, with the brain's own notes on what the three share and where they part.

| Brain       | Holds                                                  | Domain               | Content repo                       |
| ----------- | ------------------------------------------------------ | -------------------- | ---------------------------------- |
| `suspicion` | notes comparing the three; the three as approved peers | `suspicion.rizom.ai` | `rizom-ai/rover-suspicion-content` |
| `karl`      | Marx's works (unchanged)                               | `karl.rizom.ai`      | `rizom-ai/rover-karl-content`      |
| `friedrich` | Nietzsche's works (unchanged)                          | `friedrich.rizom.ai` | `rizom-ai/rover-friedrich-content` |
| `sigmund`   | Freud's works (unchanged)                              | `sigmund.rizom.ai`   | `rizom-ai/rover-sigmund-content`   |

For Rizom it is the smallest working case of a network that grows by connection rather than concentration: four brains, each holding its own sources, none holding the others' texts, and one question answered across them with every claim attributed to the brain that made it. A brain that connects to `suspicion` reaches all three through one connection.

## Non-goals

- No books in `suspicion`. It holds no author's text; quotes come from the three brains' answers and link to their sections.
- No voice of its own author. It is a seminar, not Ricoeur: Ricoeur's and Foucault's works are in copyright, so it cites them briefly as secondary sources and never speaks as either.
- No public Ask before [public-ask.md](./public-ask.md) opens guest admission in production. The seminar is first used from Studio and over A2A.
- No purpose-built seminar site in this plan. The page that sets three answers in columns is the next plan, once Phase 4 shows what an answer looks like.
- No changes to the three book brains' content or character.

## Decisions

### An organization brain, not the team bundle

The fleet's `team` bundle serves human members — trusted users writing notes, shared conversation memory, a shared action board — so it is not what this brain needs. `suspicion` is `profileKind: organization` and `anchorKind: organization`, like `hub`, with bundles `core, web, chat, site` and the built-in `@brains/site-organization` with `@rizom/theme-books`. The organization site renders entity pages for `agent` and `topic`, so its three peers appear on it without a site of its own.

### The three are asked every time

`choosePeers` (`entities/agent-discovery/src/lib/network-ask.ts`) asks the approved peers whose skills share enough words with the question, at most three, and the two nearest when none match. The book brains' skills are titled by theme ("Analyze Political Struggle", "Trace the Genealogy of Values"), so most questions would reach one or two of them, and a seminar that sometimes leaves one author out answers a different question.

A per-brain setting `askAllApproved` on `agent-discovery` makes `network_ask` ask every approved peer, capped at `MAX_ASKED_PEERS`, whatever the match. It is off by default, so no other brain's routing changes. `suspicion` sets it in `users/suspicion.yaml`.

### Character

- name: Seminar
- role: a reading seminar on Marx, Nietzsche and Freud
- instructions: put every question to the three with `network_ask`; give each author's answer under his name, with his quotes and sources as his brain returned them, never rephrased into one voice; then say in a short paragraph where they meet and where they part, drawing on the seminar's own notes; never add a quote or a citation the peers did not return; say plainly when an author's brain had nothing; answer in the reader's language.

### What the seminar's notes hold

Public `note` entries, written from the research of 26 November and each citing its sources:

- **The school of suspicion** — Ricoeur's naming of the three (Freud and Philosophy, Yale 1970, p. 32) and Foucault's "Nietzsche, Freud, Marx" (Royaumont 1964, Cahiers de Royaumont 1967), in short quotes.
- **What they knew of each other** — Freud on Nietzsche (GW X, 53; GW XIV, 86; GW XV, 79) and on Marxism (GW XV, 191–195), Nietzsche on socialism (MA 473) and his silence on Marx, Marx's 1844 "Uebermenschen"; each linked to the section on the brain that holds it.
- **Four shared themes** — consciousness not master in its own house, religion, morality as genealogy, the hidden economy beneath appearance; one note each, with one passage per author linked to his brain's section.
- **Who read them together** — Marcuse, Fromm, Assoun, Deleuze and Guattari, Leiter: titles and claims, no extracts.

The notes give the seminar its topics and agent-card skills, so a brain asking about Marx and Freud on religion finds `suspicion`, not only each author separately.

## Phases

Each phase ships on its own PR, tests first.

### Phase 1 — every approved peer, when the brain asks for it

- `askAllApproved` in the `agent-discovery` config schema, default false
- `choosePeers` takes it: when on, every approved peer, sorted as now, at most `MAX_ASKED_PEERS`
- tests: on, three approved peers and a question matching none of them, all three asked; off, unchanged
- release

### Phase 2 — content

- the notes above, staged locally and checked against the three brains: every linked section exists and holds the quoted words
- anchor profile, brain character, site info

### Phase 3 — fleet

- `users/suspicion.yaml` (organization kinds, `askAllApproved: true`, Discord off, setup email `yeehaa@rizom.ai`) and its cohort in rizom-ai/rover-pilot; `onboard`, content committed to the content repo
- `agent_connect` to `karl.rizom.ai`, `friedrich.rizom.ai` and `sigmund.rizom.ai`, approved in Studio

### Phase 4 — verify

- `https://suspicion.rizom.ai/health/ready` is 200 and its agent card names the seminar and its skills
- four questions in Studio chat: what religion is, whether consciousness is master of itself, where morality comes from, what each knew of the others; each answer reaches all three, gives each author under his name, and every cited section is among the sources his brain returned
- from `yeehaa.io`: `agent_call` to `suspicion.rizom.ai`, then `agent_connect` and `network_ask`, timing each

## Risks

- **Two hops and one budget.** `network_ask` gives each peer one budget, 30 seconds by default (`plugins.a2a.networkAskTimeoutMs`), and a brain's answer takes 15–25 seconds on the fleet. A brain asking `suspicion` that way waits for the seminar's turn and its three peers' turns, which run in parallel, inside that budget, and will often time out. `agent_call` is the path Phase 4 must show working; Phase 4 also times `network_ask` from `yeehaa.io`, and if it times out, `yeehaa.io` raises its own budget.
- **Citations not among the sources.** Karl (Deutsche Ideologie p. 46) and Sigmund (GW II/III, 283) each cited a page their search had not returned on 26 November. Setting three answers side by side makes that visible. Phase 4 checks every citation; a failure there goes back to the book plugin's instructions before the seminar is shown to anyone.
- **Retrieval misses the obvious work.** Friedrich answered on morality without the Genealogie der Moral. The seminar shows what each brain finds, not what it should have found; better retrieval belongs to the book brains.
- **Cost.** Each question is four model turns. Studio and A2A use the owner's provider budget; public Ask waits for its own budget controls.
