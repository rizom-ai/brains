# Identity & trust architecture

## Status

Positioning doc for roadmap §3 (Trust & identity). Not an execution plan —
the execution units are [multi-user.md](./multi-user.md),
[auth-runtime-db.md](./auth-runtime-db.md), and the identity parts
of [atproto-integration.md](./atproto-integration.md); A2A request signing
shipped (RFC 9421 via `shared/http-signatures`, peer-trust store,
task-caller binding) and its plan is retired. This doc exists
because those plans each answer a slice of "who is talking to the brain,
and why do we believe them" and were starting to invent parallel
primitives. It states the shared model once and settles the cross-cutting
decisions; the plans own their own phasing.

## The map

Three kinds of subject talk to a brain, over five kinds of channel:

| Subject                          | Channel                                       | Identity primitive                          | Owning plan                                        |
| -------------------------------- | --------------------------------------------- | ------------------------------------------- | -------------------------------------------------- |
| Humans (operator, collaborators) | Session interfaces (dashboard, web-chat, CMS) | Passkey → `usr_<uuid>` session              | [multi-user.md](./multi-user.md)                   |
| External clients (agents, IDEs)  | MCP over HTTP                                 | OAuth bearer, `sub` = user id               | [multi-user.md](./multi-user.md)                   |
| Peer brains (directed RPC)       | A2A                                           | Domain, proven by RFC 9421 signature        | shipped (`shared/http-signatures`)                 |
| Peer brains (ambient pub/sub)    | AT Protocol                                   | DID (`did:web:<domain>` by convention)      | [atproto-integration.md](./atproto-integration.md) |
| Platform users                   | Discord (and future platform adapters)        | Platform id (`discord:<snowflake>`) + rules | interface config / `brain.yaml` rules              |

Everything downstream of identity is the same: the resolved subject maps
into the single permission model (`admin` / `trusted` / `public`) through
`permissionService`, while Anchor ownership remains an independent identity facet. The agent enforces tool visibility per permission level. No
channel gets its own authorization scheme — channels differ only in how
they _prove_ who the caller is.

## Decisions

### 1. The permission model is the single authority

Already true in code and restated here so no plan re-litigates it: every
channel resolves its caller to `admin`/`trusted`/`public` and hands off.
A2A signing changes what feeds the identity column, not the model.
Multi-user changes who the subjects are, not the levels. MCP's CQRS
redesign gates commands behind the agent, which filters by the same
levels. Anything proposing a new authorization vocabulary is wrong by
default.

### 2. A brain's canonical identity is its domain

A brain runs at a domain; the domain is the identity peers trust. The two
brain-to-brain channels express the _same_ identity in their native form:

- **A2A** uses the bare domain, proven per-request by an RFC 9421
  signature whose `keyid` resolves to `https://<domain>/.well-known/jwks.json`.
- **ATProto** uses the DID form. `did:web:<domain>` _is_ domain identity
  (it resolves to a key document at a well-known path on that domain), so
  the existing `did:web:<site-host>` convention for the brain DID is
  confirmed — it is not a second identity, it is the same one spelled for
  the ATProto ecosystem. A `did:plc` from a PDS account is **repo**
  identity (who owns the data repository), never brain identity.

No new identifier scheme is invented anywhere. If content portability
ever demands DID-first identity (a brain moving domains without losing
its history), that is a deliberate future migration in which the domain
becomes the human-legible alias of a portable DID — not something any
current plan should half-build.

### 3. One key-custody home; purpose-bound keypairs; one publication point

A brain holds exactly two keypairs, and `shell/auth-service` owns the
lifecycle (generate on first boot, persist under runtime auth storage,
reload, rotate) for both:

- **ES256** — OAuth/JWT signing (exists today).
- **Ed25519** — A2A request signing (shipped with the request-signing work).

Both are published in the single `/.well-known/jwks.json`, distinguished
by `alg`. Purpose separation is deliberate: rotating the OAuth key must
not invalidate A2A peer relationships, and vice versa.

ATProto record-signing keys are **not** brain-held in the current phase:
the PDS custodies them, and the brain authenticates _to_ the PDS
(app-password today, OAuth per the atproto plan). If a brain ever runs
its own PDS, those keys join the same custody module — but that is a
hosting decision, not an identity decision.

### 4. The agent directory is the single trust-establishment flow; grants live on the runtime plane

Both brain-to-brain channels converge on the existing `agent` entity's
discovered → approved lifecycle:

- A2A peer approval fetches the peer's agent card and JWKS.
- ATProto discovery ingests signed brain cards into the same directory as
  reviewable `agent` entities (already implemented as the bounded
  discovery slice).

Approval is one anchor-confirmed action covering **both directions**: the
entity becomes `approved` (directory UX, outbound calling), and a
peer-trust record — **domain + pinned key fingerprint + granted inbound
level** (`trusted`/`public`; `admin` is never grantable to a peer) — is
written to runtime auth storage. The runtime record, not the entity, is
what inbound verification consults. This is the same content/runtime
split as decision 3 in reverse: agent entities are git-synced brain-data
ingested automatically by directory-sync, so an entity-borne grant would
let anyone with a commit to the content repo mint themselves inbound
trust. Authorization state never rides the content plane.

The fingerprint pin is trust-on-first-use: if a peer's published keys
later change without overlap (no grace-window rotation via JWKS
multi-key publishing), the peer drops back to discovered and requires
re-approval. No secret is ever exchanged in any trust flow.

### 5. Humans and brains stay distinct actors; peer association grants nothing

Auth users attach to stable person subjects that own verified human identity claims such as Discord and email. External brains remain independent actors with their own DIDs, domains, keys, peer trust, and attribution.

A person may have an optional `person_external_peers` association for Admin-console discovery and profile display. That association is not representation or delegation: it never turns a brain into a human login identity, inherits no person role, changes no A2A trust, and creates no `onBehalfOf` attribution. Actions by the external brain remain attributed to that brain.

Peer-first invitation may create an invited local account and the independent peer association atomically, but setup still requires human control of a verified delivery channel and passkey. Raw provider subjects and machine identifiers remain private runtime evidence, and auth administration remains non-model-visible.

## What this settles in the execution plans

**A2A request signing** (shipped; plan retired) — its open questions resolved here: package
home is `shared/http-signatures` (standalone library, no brain-specific
deps); multi-key rollover is supported via JWKS multi-key publishing and
`kid` matching; `JwksResolver` is a brain-level singleton; v1 signs
requests only (response/stream signing is a separate future question);
and directory approval writes the runtime peer-trust record — pinned
fingerprint plus granted inbound level — per decision 4.

**multi-user.md** — decisions 14–15 own person-centered human claims, DB-backed access, invitations, and access-neutral external-peer associations. Brain/agent proof remains dependent on A2A/ATProto verification; a peer profile can never establish a human authentication binding.

**atproto-integration.md** — the brain-DID convention
(`did:web:<site-host>`) is ratified as the DID spelling of decision 2's
domain identity; Anchor DIDs remain distinct from human auth identities;
discovery stays pointed at the shared agent directory.

## Sequencing

The two subject tracks can otherwise proceed in parallel, with one explicit
provider-connection dependency:

- **Humans**: auth-runtime-db → multi-user phases 1–2 (real users, roles,
  per-session MCP permissions).
- **Brains**: A2A request signing shipped (keys, signing, verification,
  task binding); ATProto protocol work remains independent.
- **Outbound ATProto OAuth**: auth-runtime-db must land first. Bluesky access
  tokens, rotating refresh tokens, and DPoP key material are received provider
  credentials and belong in a dedicated external-provider connection store on
  the private auth runtime plane, not in the ATProto plugin or the brain's
  existing issued-grant tables.

Optional person-to-peer association can land only after both tracks can verify their own subjects; it never merges those subjects or their authorization.
