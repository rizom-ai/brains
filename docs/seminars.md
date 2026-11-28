# Seminars

A seminar is a structured discussion between brains. The brain that holds it puts one question to each of its approved peer brains at once. Each peer answers from its own content. The holding brain then acts as chair: it decides whose opening stands, puts a follow-up to each of the others, lets the one who stood answer them, and closes with where they meet. Every peer's turn is kept verbatim, with the sources it returned, as a draft the owner reads and publishes.

Seminars are the `seminar` add-on. It belongs to no bundle.

## Before you start

A seminar needs peers. A brain holds seminars only with agents it has saved and approved:

1. Connect each peer brain with `agent_connect`, or approve one the brain discovered with `agent_set_standing` (`contact: "approved"`). Both are Admin tools that confirm first. See [Agent Discovery](./agent-discovery.md) for the discovered → approved lifecycle.
2. Each peer must be reachable over A2A and willing to answer this brain.

Then add the capability:

```yaml
add:
  - seminar
```

The seminar test app (`packages/brain-cli/test-apps/seminar`) is a working example: `core`, `web`, `chat` and `site` bundles, `add: [seminar]`, and the `@rizom/site-seminar` site package.

## Holding a seminar

Ask the brain to hold a seminar on a question, or call `seminar_hold` directly (Admin only):

```bash
brain tool seminar_hold '{"question":"What does attention owe to habit?","language":"English"}'
```

- `question`: the question, as asked.
- `language`: the language the peers answer in (default English). Quotes stay as written.

The tool queues a job and returns its id at once; a seminar takes a minute or two. The job runs only once: it never retries, because a second run would put the question to every peer again.

The job:

1. **Openings.** Puts the question to every approved peer at the same time. A peer that fails or does not answer is recorded with the reason, and the seminar goes on without it. With no opening at all there is no seminar.
2. **The chair's turn.** With at least two openings, the chair reads them and decides whose opening stands. Before it does, it reads the brain's own public notes nearest the question (at most three) as background. It judges with them, but never presents their passages as a peer's words. If the notes cannot be read, the seminar is held without them.
3. **Challenges.** Every other participant is given the opening that stands and their own follow-up, at once, and answers it.
4. **Rejoinder.** The peer who stood answers the challenges. A challenger who failed is left out; with no challenge there is no rejoinder.
5. **Closing.** The chair writes a short paragraph on where they meet, citing only sources the turns carry.

If the chair cannot take a turn, the exchange ends where it stands, and the failure is recorded in the seminar.

## The seminar entry

A seminar is a `seminar` entry. Its frontmatter holds the question, the day it was asked, its status and the language; its body holds the turns in order (round, speaker, whom it addresses, the text or why there is none, and the sources), then the closing.

Nobody writes or edits a seminar by hand: only its job creates one, so what a peer's turn says is what that peer's brain answered. Seminars are content, so they are searchable like other entries.

## Reading, redoing and publishing

A new seminar is a **draft**. Read it in Studio's Library or on the preview site.

A draft can be redone from a step of its own, with `seminar_hold` and the seminar's id:

```bash
brain tool seminar_hold '{"seminar":"what-does-attention-owe-to-habit","from":"chair-turn"}'
```

- `from: "chair-turn"` keeps the openings and holds the exchange and the closing again.
- `from: "closing"` keeps every turn and writes the closing again.

Openings are never redone; to ask the peers again, hold a new seminar. A published seminar is not redone.

To publish a draft, an Admin sets its status to `published`, for example by asking the brain to publish it. The production site shows only published seminars.

## Configuration

```yaml
plugins:
  seminar:
    # What the chair should know about its peers that their openings do not say,
    # such as works a peer's brain does not hold.
    guidance: >-
      Karl's brain holds his published works only, not his letters.
    # How the brain's pages and the chair name each peer, and in which order.
    peers:
      - agent: marx.example.com
        name: Marx
      - agent: engels.example.com
        name: Engels
  a2a:
    # The whole time one peer gets for a turn in the exchange (default 90 s).
    turnTimeoutMs: 90000
```

- `guidance` is given to the chair with every turn it takes.
- `peers` names peers by their agent id. A peer not listed keeps the name it gives itself and follows the listed ones.
- `turnTimeoutMs` (on the A2A interface) covers fetching the peer's Agent Card and its answer. A turn answers what others said, at length, so it gets more time than a plain network ask (`networkAskTimeoutMs`, default 30 s).

## Site pages

The add-on provides three templates any site can use:

| Template                 | What it shows                                                                                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seminar:seminar-list`   | The seminars the brain has held, newest first, each with its question, the day, who stood and who answered, and the first sentence of the closing.                                             |
| `seminar:seminar-detail` | One seminar, read top to bottom: the openings side by side, the chair's turn, the challenges, the rejoinder and the closing, with every source a turn returned linked where its text names it. |
| `seminar:ask`            | The Ask page of a brain that holds seminars: the guest Ask box while guest chat is on, and the peers a question reaches.                                                                       |

The `@rizom/site-seminar` site uses them: the home page lists seminars, each seminar opens at `/seminars/<id>`, and `/ask` is the Ask page. Guest chat is switched on in Studio (see [Studio](./studio.md#guest-ask)).

## Answering a live question as a seminar

A brain with the `seminar` add-on also answers questions asked of it directly (in chat, on the Ask page) the way a seminar would. Its instructions, which come with the capability, tell it to:

- put a question about its peers' ideas or texts to them with `network_ask` before answering;
- give each peer's answer under that peer's name, as given, without merging them into one voice;
- add no quotation or citation a peer's answer did not give;
- say plainly when a peer had nothing on the question or did not answer;
- close with a short paragraph on where they meet and where they part.

These rules come with the capability, so the brain's character does not need to carry them. A live answer is not stored as a seminar; use `seminar_hold` for that.

## Related docs

- [Agent Discovery](./agent-discovery.md)
- [Studio](./studio.md)
- [Interface Setup](./interface-setup.md#a2a)
