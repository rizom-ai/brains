# @brains/messaging-service

In-process message bus for Brain shell services and plugins: events, and
cross-package calls through bus contracts.

## Overview

`@brains/messaging-service` provides an in-memory `MessageBus` with
`send`/`subscribe`/`collect`, optional source/target/metadata filters, and
broadcast support. Handlers can be synchronous or asynchronous.

A plain `send` calls handlers in registration order and stops at the first that
answers. Its reply's `data` is `unknown`. Code that relies on a reply asks
through a bus contract, whose schemas check both sides.

## Bus contracts

A request or command that crosses a package boundary is declared once with
`defineBusContract` from `@brains/contracts`, beside the schemas it carries:

```typescript
import { defineBusContract } from "@brains/contracts";
import { z } from "@brains/utils/zod";

export const noteCaptureContract = defineBusContract({
  channel: "note:capture",
  request: z.object({ id: z.string(), title: z.string(), body: z.string() }),
  response: z.object({ noteId: z.string(), created: z.boolean() }),
  delivery: "request",
});
```

`delivery` is one of:

- `request`: exactly one owner answers. A second owner throws at registration.
- `collect`: every owner answers, and the sender receives every valid answer.
- `command`: every owner hears it and nobody answers.

Plugins use the messaging namespace; shell code calls `requestContract`,
`collectContract`, `commandContract` and `answerContract` from this package
with the bus it owns.

| Plugin call                                    | Result                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| `context.messaging.request(contract, payload)` | `{ status: "answered", data }`, `{ status: "unavailable" }` or `{ status: "failed" }` |
| `context.messaging.gather(contract, payload)`  | `{ status: "answered", answers, failures }` or `{ status: "unavailable" }`            |
| `context.messaging.command(contract, payload)` | resolves once every owner has heard it                                                |
| `context.messaging.answer(contract, handler)`  | an unsubscribe function                                                               |

- The sender's payload is parsed with the request schema before it is sent; an
  invalid payload throws.
- `unavailable` means no plugin answers the contract in this process. It is
  decided from the subscriber count, never from an error string.
- An owner's handler sees only a valid request; an invalid one is answered with
  `Invalid <channel> request`. Its reply leaves only when the response schema
  accepts it, otherwise the sender gets `failed`.
- The handler's second argument names the sending plugin (`{ sender }`).
- An execution-only (worker) process answers only with
  `answer(contract, handler, { everyProcess: true })`.

A job that one package enqueues for another is declared with
`defineJobContract({ type: "owner:job", input })` from `@brains/contracts`.
`context.jobs.enqueue(contract, data, { toolContext })` parses the data first,
and `context.jobs.has(contract)` reports whether the job type is declared.

ESLint rejects a raw `messaging.send` in entity, plugin and interface source
unless it passes `broadcast: true`.

## Usage

```typescript
import { MessageBus } from "@brains/messaging-service";
import type { Logger } from "@brains/utils/logger";

declare const logger: Logger;

const messageBus = MessageBus.createFresh(logger);

const unsubscribe = messageBus.subscribe<{ id: string }>(
  "entity:created",
  async () => ({ success: true }),
);

await messageBus.send({
  type: "entity:created",
  payload: { id: "123" },
  sender: "entity-service",
  broadcast: true,
});

unsubscribe();
```

## Filters

Subscriptions can be restricted by source, target, metadata, or a custom
predicate.

```typescript
messageBus.subscribe(
  "job:progress",
  async (message) => ({ success: true, data: message.payload }),
  {
    source: "job:*",
    target: "matrix:room-1",
    metadata: { visible: true },
  },
);
```

String filters support `*` wildcards. `RegExp` filters are also supported.

## Broadcasts

Set `broadcast: true` to invoke all matching handlers. The bus awaits each
handler and does not return handler data for broadcast messages.

```typescript
await messageBus.send({
  type: "sync:completed",
  payload: { success: true },
  sender: "directory-sync",
  broadcast: true,
});
```

## Testing

Use a fresh bus instance for isolated tests:

```typescript
const messageBus = MessageBus.createFresh(logger);
```

The package also exposes `@brains/messaging-service/test` for a preconfigured
mock message bus.

## Public exports

- `MessageBus`
- `IMessageBus`
- `MessageResponse`
- `MessageHandler`
- `MessageSender`
- `MessageSendOptions`
- `MessageSendRequest`
- `MessageBusSendRequest`
- `BaseMessage`
- `MessageWithPayload`
- `MessageContext`
- `SubscriptionFilter`
- Message schemas and `hasPayload`

## License

AGPL-3.0-only
