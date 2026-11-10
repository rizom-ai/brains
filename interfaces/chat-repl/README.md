# @brains/chat-repl

Terminal chat REPL interface for local interaction with a running brain, built with Ink.

## Overview

`@brains/chat-repl` provides a local, terminal-first interface plugin. User input is routed through the brain's agent service, so the REPL behaves like a natural-language conversation surface rather than a command parser.

It also keeps a few local UI commands for terminal control:

- `/exit` or `/quit` — leave the REPL
- `/clear` — clear the visible message history
- `/progress` — toggle detailed progress output

## Current behavior

- natural-language chat routed through the agent service
- inline progress reporting for long-running work
- command/message history in the terminal session
- confirmation handling for destructive or review-required actions
- keyboard shortcuts for clearing, exiting, and progress display

## Usage

This package is currently a private workspace package and is typically consumed through the canonical definition or workspace imports.

The package default-exports a declarative interface definition. A brain started with `--cli` registers it under the plugin id `cli`; its daemon `cli:cli` opens the Ink-based terminal UI and keeps a single local conversation, `cli`.

## Configuration

```typescript
interface CLIConfig {
  theme?: {
    primaryColor?: string;
    accentColor?: string;
  };
}
```

Defaults:

- `theme.primaryColor`: `#0066cc`
- `theme.accentColor`: `#ff6600`

## Keyboard shortcuts

- `Ctrl+C` — exit
- `Ctrl+L` — clear the screen
- `Ctrl+P` — toggle detailed progress
- `Shift+↑ / Shift+↓` — scroll by line
- `Page Up / Page Down` — scroll by larger steps

## Exports

- the CLI interface definition (default export)
- `cliConfigSchema`
- `CLIConfig`, `CLIConfigInput`
- `ProgressBar`
- `BatchProgress`

## Related docs

- [interfaces/AGENTS.md](../AGENTS.md)
- [Architecture Overview](../../docs/architecture-overview.md)
- [Plugin System](../../docs/plugin-system.md)

## License

AGPL-3.0-only
