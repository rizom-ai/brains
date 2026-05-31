# ATProto Lexicons

Rizom publishes AT Protocol custom lexicons under the `ai.rizom.brain.*` NSID namespace.

The canonical public URL format is:

```text
https://rizom.ai/atproto/lexicons/<nsid>.json
```

Example:

```text
https://rizom.ai/atproto/lexicons/ai.rizom.brain.post.json
```

## Published lexicons

| NSID                        | Purpose                                                  |
| --------------------------- | -------------------------------------------------------- |
| `ai.rizom.brain.card`       | Brain capability card                                    |
| `ai.rizom.brain.post`       | Blog post projection                                     |
| `ai.rizom.brain.note`       | Knowledge note projection                                |
| `ai.rizom.brain.link`       | Curated link projection                                  |
| `ai.rizom.brain.deck`       | Presentation deck projection                             |
| `ai.rizom.brain.socialPost` | Semantic social-post projection, not a Bluesky feed post |
| `ai.rizom.brain.series`     | Public series/grouping projection                        |
| `ai.rizom.brain.project`    | Portfolio/project projection                             |
| `ai.rizom.brain.topic`      | Public topic projection                                  |

## Ownership

Canonical `ai.rizom.brain.*` lexicon JSON has one in-repo source of truth: `@brains/atproto-contracts`.

Entity packages own projection/mapping logic only. For example, `entities/blog` owns the mapper from local `post` entities to `ai.rizom.brain.post` records, but it imports the canonical `ai.rizom.brain.post` lexicon from `@brains/atproto-contracts` instead of defining a separate schema.

The `@brains/atproto-registry` plugin serves those same contract-owned lexicons from the official `rizom.ai` brain/site. Runtime projection registration and public protocol publication are separate responsibilities, but both consume the same canonical contract artifacts.

Brain-specific extensions must use a namespace controlled by that brain/operator. They must not redefine or mutate `ai.rizom.brain.*`.

## Validation policy

PDS-side validation is not the authoritative contract for Rizom custom records. Public PDS instances may not know custom Rizom lexicons, so custom record writes can use `validate: false` at the PDS boundary.

Rizom validates projected records locally before dry-run output or PDS writes. Local validation uses the canonical lexicon imported from `@brains/atproto-contracts` and rejects malformed records before they are stored in a PDS repo.

## Compatibility policy

Compatible changes:

- adding optional fields
- adding descriptions or documentation
- loosening non-required constraints when existing records remain valid

Potentially incompatible changes:

- removing fields
- changing field types
- adding required fields
- narrowing `knownValues`
- tightening length or format constraints in a way that invalidates existing records

Incompatible changes require either a deliberate migration plan or a new NSID/versioned record type. Existing published records should remain parseable by future Rizom consumers whenever possible.

## Consumer guidance

Consumers should identify records by NSID and fetch the matching canonical lexicon JSON from:

```text
https://rizom.ai/atproto/lexicons/<nsid>.json
```

Consumers should not depend on repository-local source paths. `@brains/atproto-contracts` is the in-repo source of truth; the public registry route is the interoperability contract.
