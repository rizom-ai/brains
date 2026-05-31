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

Service-level lexicons, such as `ai.rizom.brain.card`, are owned by `plugins/atproto`.

Entity projection lexicons are owned by the entity package that owns the local entity schema and mapper. For example, `ai.rizom.brain.post` is owned by `entities/blog`.

The Rizom site serves public copies from package-owned sources. Drift tests ensure public lexicon assets do not silently diverge from their owning packages.

## Validation policy

PDS-side validation is not the authoritative contract for Rizom custom records. Public PDS instances may not know private/custom Rizom lexicons, so custom record writes can use `validate: false` at the PDS boundary.

Rizom validates projected records locally before dry-run output or PDS writes. Local validation uses the registered projection lexicon and rejects malformed records before they are stored in a PDS repo.

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

Consumers should not depend on repository-local source paths. Package-local lexicons are implementation ownership; the public URL is the interoperability contract.
