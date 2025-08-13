# @brains/cli

Command-line interface for Personal Brain applications using Ink (React for CLI).

## Overview

This package provides an interactive terminal interface for Brain applications with real-time updates, command history, and progress tracking.

## Features

- Interactive terminal UI with Ink (React)
- Command execution with auto-completion
- Real-time progress bars for batch operations
- Conversation history and context
- Multi-line input support
- Status bar with current state
- Command history navigation

## Installation

```bash
bun add @brains/cli
```

## Usage

### As a Plugin

```typescript
import { CLIInterface } from "@brains/cli";

const cli = new CLIInterface({
  prompt: "brain> ",
  historyFile: ".brain_history",
});

// Register with shell
await shell.registerPlugin(cli);
```

### Standalone

```typescript
import { CLIInterface } from "@brains/cli";
import { Shell } from "@brains/core";

// Initialize shell
const shell = await Shell.initialize({
  plugins: [
    new CLIInterface(),
    // other plugins
  ],
});
```

## User Interface

The CLI provides a rich terminal interface:

```
┌─────────────────────────────────────┐
│ Brain CLI v1.0.0                    │
├─────────────────────────────────────┤
│                                     │
│ > create note "Meeting Notes"       │
│ Created note: note_abc123           │
│                                     │
│ > search "project updates"          │
│ Found 3 results:                    │
│ 1. Project Status Update            │
│ 2. Q4 Project Planning              │
│ 3. Project Milestone Review         │
│                                     │
│ > _                                 │
├─────────────────────────────────────┤
│ Ready | Entities: 42 | Memory: 12MB │
└─────────────────────────────────────┘
```

## Components

### App Component

Main application container with message list and input:

```typescript
<App
  messages={messages}
  onSubmit={handleCommand}
  status={currentStatus}
/>
```

### EnhancedInput

Advanced input with history and multi-line support:

```typescript
<EnhancedInput
  prompt="brain> "
  onSubmit={handleSubmit}
  history={commandHistory}
  multiline={false}
/>
```

### BatchProgress

Progress tracking for batch operations:

```typescript
<BatchProgress
  jobId="import_123"
  title="Importing entities"
  operations={[
    { name: "Reading files", progress: 100 },
    { name: "Processing", progress: 45 },
    { name: "Saving", progress: 0 },
  ]}
/>
```

### StatusBar

Bottom status bar with system information:

```typescript
<StatusBar
  status="Ready"
  entityCount={42}
  memoryUsage="12MB"
/>
```

## Commands

Commands are auto-generated from plugin tools:

```bash
# Entity operations
> create note "Title" --content "Content here"
> search "query text"
> update note_123 --content "New content"
> delete note_123

# System commands
> help
> status
> clear
> exit

# Conversation
> getmessages conv_123
> getconversation conv_123
```

## Keyboard Shortcuts

- `↑/↓` - Navigate command history
- `Tab` - Auto-complete commands
- `Ctrl+C` - Cancel current operation
- `Ctrl+D` - Exit
- `Ctrl+L` - Clear screen

## Progress Events

The CLI subscribes to job progress events:

```typescript
// Batch operations show progress
messageBus.emit("job:progress", {
  jobId: "import_123",
  progress: 45,
  message: "Processing file 45/100",
});
```

## Configuration

```typescript
interface CLIConfig {
  prompt?: string; // Command prompt (default: "> ")
  historyFile?: string; // History file path
  maxHistory?: number; // Max history entries (default: 1000)
  theme?: {
    primary?: string; // Primary color
    success?: string; // Success messages
    error?: string; // Error messages
    info?: string; // Info messages
  };
}
```

## Message Formatting

Messages support markdown formatting:

```typescript
// Bold, italic, code
**bold text** *italic* `code`

// Lists
- Item 1
- Item 2

// Code blocks
\`\`\`typescript
const example = "code";
\`\`\`

// Links (shown as text)
[Link text](url)
```

## Testing

```typescript
import { render } from "ink-testing-library";
import { App } from "@brains/cli";

const { lastFrame, stdin } = render(
  <App messages={[]} onSubmit={jest.fn()} />
);

// Simulate input
stdin.write("create note Test\n");

// Check output
expect(lastFrame()).toContain("create note Test");
```

## Architecture

The CLI uses the MessageInterfacePlugin base class:

1. Receives commands from user input
2. Executes via CommandRegistry
3. Formats responses for display
4. Maintains conversation context
5. Handles async operations with progress

## Exports

- `CLIInterface` - Main interface plugin class
- `App` - Root React component
- `EnhancedInput` - Input component
- `BatchProgress` - Progress component
- `StatusBar` - Status component
- Components and utilities

## License

MIT
