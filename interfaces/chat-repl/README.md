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

This package is currently a private workspace package and is typically consumed through brain models or workspace imports.

```typescript
import { CLIInterface } from "@brains/chat-repl";

const cli = new CLIInterface({
  theme: {
    primaryColor: "#0066cc",
    accentColor: "#ff6600",
  },
});
```

Registered as an interface plugin, it opens an Ink-based terminal UI and keeps a single local conversation channel.

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

- `CLIInterface`
- `cliConfigSchema`
- `CLIConfig`
- `ProgressBar`
- `BatchProgress`

## Related docs

- [interfaces/AGENTS.md](../AGENTS.md)
- [Architecture Overview](../../docs/architecture-overview.md)
- [Plugin System](../../docs/plugin-system.md)

## License

Apache-2.0
