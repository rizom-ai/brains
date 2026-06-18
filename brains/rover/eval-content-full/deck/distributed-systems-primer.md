---
title: "Distributed Systems: A Practical Primer"
slug: distributed-systems-primer
status: published
description: A short deck covering the core concepts every developer should know about distributed systems
publishedAt: "2025-09-10T00:00:00.000Z"
checksum: seed
created: "2025-09-10T00:00:00.000Z"
updated: "2025-09-10T00:00:00.000Z"
---

# Distributed Systems: A Practical Primer

What every developer should know before building one.

---

## The Eight Fallacies

1. The network is reliable
2. Latency is zero
3. Bandwidth is infinite
4. The network is secure
5. Topology doesn't change
6. There is one administrator
7. Transport cost is zero
8. The network is homogeneous

Every distributed system bug traces back to one of these.

---

## CAP Theorem (Simplified)

Pick two:

- **Consistency** — every read returns the most recent write
- **Availability** — every request receives a response
- **Partition tolerance** — the system works despite network splits

In practice, partitions happen. So you're choosing between C and A.

---

## Patterns That Work

- **Idempotency** — safe to retry any operation
- **Circuit breakers** — fail fast instead of waiting
- **Event sourcing** — append-only log of state changes
- **CQRS** — separate read and write models
- **Saga pattern** — distributed transactions without 2PC

---

## The One Rule

If you can solve it without distribution, do that instead.

Distribution adds latency, complexity, and failure modes. Only distribute when you must — for scale, availability, or data locality.
