---
"@rizom/brain": patch
---

Register FAQ capture, reconciliation, subscriptions and evals through the declarative SDK. Preserve claim and receipt identities, pin message counts inside persistence transactions, and use deterministic message ordering when timestamps tie. Reconciliation listens for embedding readiness in workers as well as the interactive app. Retire the native plugin, adapter, handler, store and eval-registration bridges; keep recovery and crash tests on canonical codecs and owned SDK mutations. Bounded nearest queries preserve authored markdown bytes rather than trimming them before embedding.

Upgrade exact persisted FAQ job dispatch/source/owner identities without changing payloads, status, attempts or leases. This is a one-way migration: stop old writers first; mixed-version execution and downgrade are unsupported. Ambiguous claims still require manual review and are never expired or replayed automatically.

Allow explicitly restricted evaluation seeds and explicitly scoped fixture resets so private FAQ eval examples do not become public. Use isolated evaluation data: resetting declaring types can delete their existing entities. Registration does not invoke models, and durable at-most-once effects do not bound provider spending.
