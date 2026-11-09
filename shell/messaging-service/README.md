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
- A failure reaches the sender in its public form, as an `SdkError` publishes
  it: `failed` carries `error: { code, message }` (`SdkErrorData`), and each
  of `gather`'s `failures` is one. An owner that throws an `SdkError` keeps its
  code and public message; any other error is `handler_failed` with the code's
  standard message. The message a failure was thrown with stays in the owner's
  log, as an error for `handler_failed` and a warning for any other code. To
  pass a failure on, throw `sdkErrorFrom(result.error)`, which keeps both.
- An owner's handler sees only a valid request; an invalid one is answered with
  `invalid_input` and `Invalid <channel> request`. Its reply leaves only when
  the response schema accepts it, otherwise the sender gets `invalid_response`.
- The handler's second argument names the sending plugin (`{ sender }`).
- An execution-only (worker) process answers only with
  `answer(contract, handler, { everyProcess: true })`.

A job that one package enqueues for another is declared with
`defineJobContract({ type: "owner:job", input })` from `@brains/contracts`.
`context.jobs.enqueue(contract, data, { toolContext })` parses the data first,
and `context.jobs.has(contract)` reports whether the job type is declared.

ESLint rejects a raw `messaging.send` in entity, plugin and interface source
unless it passes `broadcast: true`.

## Broadcast events

An event a package broadcasts is declared once as a typed channel, with
`defineChannel` from `@brains/contracts`, beside the schema its payload passes.
The publish events (`publishCompletedChannel`, `publishFailedChannel`) live in
`@brains/contracts`. The others live beside the schema their payload passes and
reach plugins through `@brains/plugins`: the entity events
(`entityCreatedChannel`, `entityUpdatedChannel`, `entityDeletedChannel`,
`embeddingReadyChannel`) in `@brains/entity-service`, `jobProgressChannel` in
`@brains/job-queue`, the conversation messages
(`conversationMessageAddedChannel`, `conversationGuestMessageAddedChannel`) in
`@brains/conversation-service`, the tool events (`toolInvokingChannel`,
`toolCompletedChannel`, `toolFailedChannel`) in `@brains/ai-service`, and
`initialSyncCompletedChannel` in `@brains/plugins` itself.

```typescript
context.messaging.observe(entityUpdatedChannel, async (change) => {
  // change.entityType, change.entityId and change.entity are validated
  return { success: true };
});
```

- `subscribe`, `observe` and `subscribeExecution` take a channel. The handler
  receives the validated payload, then the message without it.
- A malformed payload is refused with `Invalid <channel> payload` and a logged
  warning; the handler never sees it.
- Every process raises entity events, so `subscribe` refuses their channels,
  at compile time and at registration. They take `observe` or
  `subscribeExecution`.
- ESLint rejects type arguments on `subscribe`, `observe` and
  `subscribeExecution` in entity, plugin, interface, shared and shell source,
  this package aside: a type argument casts a payload nobody validated.

## Usage

```typescript
import { MessageBus } from "@brains/messaging-service";
import type { Logger } from "@brains/utils/logger";

declare const logger: Logger;

const messageBus = MessageBus.createFresh(logger);

const unsubscribe = messageBus.subscribe("entity:created", async () => ({
  success: true,
}));

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
