---
"@brains/sdk": minor
"@brains/plugins": minor
"@rizom/brain": minor
---

Infer inline literal, enum, and discriminated-union responses for routes, tools,
and schema-bearing subscriptions without requiring return annotations or literal
assertions. Accept immutable arrays and tuples in schema-validated handler
returns without weakening literal, tuple, or opaque-object constraints. Preserve
response-schema input/output distinctions and the existing call signatures.

Give subscription callbacks a frozen entity-reader object instead of the full
entity service hidden behind a narrow type. All three subscription families
retain typed reads without receiving mutation or registration capabilities.

Exercise both changes through source, built declarations, and packed public
consumers. Cross-boundary error consistency remains a separate internal task.
