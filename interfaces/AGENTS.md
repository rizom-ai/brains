# interfaces/AGENTS.md

## Scope

This file applies to all packages under `interfaces/`.

## Purpose

Interfaces are user-facing transports, including:

- MCP
- chat and command interfaces
- web chat
- agent-to-agent transports

The runtime hosts HTTP itself (`shell/http-host`): an interface declares the routes it serves and never opens a listener.

## Required conventions

- A converted interface is a declarative definition: `defineInterface` from `@brains/sdk/interfaces`, with what the public contract does not offer from `@brains/sdk/internal/interface-runtime` (`interfaceRuntime(context)`, `withDaemon`, `withMessageTransport`) and, for its browser UI, `@brains/sdk/internal/message-display`. Its production code imports nothing from `@brains/plugins` or another shell package; `arch:check` refuses it.
- Packages here are `defineInterface` and `defineMessageInterface` definitions, imported through `@brains/sdk`.
- Track conversations for any message-based interface.
- Use daemon lifecycle hooks carefully.
- Register a message interface's channels and senders in `registerChannels()`, not `onRegister()`. The worker runs only that hook, so background jobs can send on the channel; it must not connect, listen or subscribe.
- Check permissions before sensitive actions.

## Do not

- Do not define entity schemas here.
- Do not add service-plugin responsibilities unless the interface truly owns them.
- Do not skip conversation tracking for message-based interfaces.

## Testing

- Test lifecycle behavior.
- Test request and message routing.
- Test conversation and permission handling.
- Mock transport dependencies.

## References

- `docs/architecture-overview.md`
- `entities/AGENTS.md`
- `plugins/AGENTS.md`
- Interface examples in `interfaces/*/src/`
