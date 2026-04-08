# interfaces/AGENTS.md

## Scope

This file applies to all packages under `interfaces/`.

## Purpose

Interfaces are user-facing transports, including:

- MCP
- chat and command interfaces
- web servers
- agent-to-agent transports

## Required conventions

- Use `InterfacePlugin` for HTTP/API-style transports.
- Use `MessageInterfacePlugin` for conversational transports.
- Track conversations for any message-based interface.
- Use daemon lifecycle hooks carefully.
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
