# @brains/messaging-service

Event-driven request/broadcast messaging for Brain shell services.

## Overview

`@brains/messaging-service` provides an in-memory `MessageBus` with typed
`send`/`subscribe` APIs, optional source/target/metadata filters, and broadcast
support. Handlers can be synchronous or asynchronous.

## Usage

```typescript
import { MessageBus } from "@brains/messaging-service";
import type { Logger } from "@brains/utils";

declare const logger: Logger;

const messageBus = MessageBus.getInstance(logger);

const unsubscribe = messageBus.subscribe<{ id: string }, { accepted: true }>(
  "entity:created",
  async (message) => {
    return {
      success: true,
      data: { accepted: true },
    };
  },
);

const response = await messageBus.send(
  "entity:created",
  { id: "123" },
  "entity-service",
);

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

Pass `true` as the final `send` argument to invoke all matching handlers. The
bus awaits each handler and does not return handler data for broadcast messages.

```typescript
await messageBus.send(
  "sync:completed",
  { success: true },
  "directory-sync",
  undefined,
  undefined,
  true,
);
```

Handlers that do not need to return data can return `{ noop: true }`.

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
- `BaseMessage`
- `MessageWithPayload`
- `MessageContext`
- `SubscriptionFilter`
- Message schemas and `hasPayload`

## License

Apache-2.0
