---
title: TypeScript Design Patterns
slug: typescript-patterns
status: published
description: Common patterns for building type-safe applications in TypeScript
publishedAt: "2025-07-15T00:00:00.000Z"
checksum: seed
created: "2025-07-15T00:00:00.000Z"
updated: "2025-09-01T00:00:00.000Z"
---

# TypeScript Design Patterns

Patterns I keep coming back to when building type-safe applications.

## Discriminated Unions

The most useful pattern in TypeScript. Use a literal type discriminator instead of optional fields:

```typescript
type Result<T> = { success: true; data: T } | { success: false; error: string };
```

TypeScript narrows automatically in conditionals. No casts, no assertions.

## Branded Types

Prevent mixing up values that share the same primitive type:

```typescript
type UserId = string & { __brand: "UserId" };
type PostId = string & { __brand: "PostId" };
```

You can't accidentally pass a PostId where a UserId is expected.

## Zod for Runtime + Static Typing

One schema, one type, no drift:

```typescript
const userSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});
type User = z.infer<typeof userSchema>;
```
