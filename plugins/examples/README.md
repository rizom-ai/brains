# Plugin Examples

This package contains example implementations of different plugin types to demonstrate the capabilities and patterns of the Brain plugin system.

## Example Plugins

### 1. Core Plugin Example

**File**: `src/core-plugin-example.ts`

Demonstrates basic plugin functionality:

- Message handling
- Template registration
- Logging capabilities

### 2. Interface Plugin Example

**File**: `src/interface-plugin-example.ts`

Shows how to create an interface plugin:

- Command handling
- Message processing
- User interaction

### 3. Message Interface Plugin Example

**File**: `src/message-interface-plugin-example.ts`

Advanced message handling plugin:

- Progress tracking
- Batch processing
- Event handling

### 4. Service Plugin Example (Calculator)

**File**: `src/service-plugin-example.ts`

Full-featured service plugin demonstrating:

- Entity management
- Job queue integration
- AI content generation
- Tool and resource registration
- Route handling for web UI

## Usage

These examples are for reference only and are not meant to be instantiated directly in production code. They serve as templates and learning resources for creating your own plugins.

To study an example:

```typescript
import { CalculatorServicePlugin } from "@brains/plugin-examples";

// Review the implementation for patterns and best practices
```

## Creating Your Own Plugin

1. Choose the appropriate base class based on your needs
2. Reference the corresponding example for patterns
3. Implement your plugin's specific functionality
4. Register it with the plugin manager

## Plugin Types Hierarchy

```
BasePlugin
├── CorePlugin (basic functionality)
├── InterfacePlugin (user interfaces)
├── MessageInterfacePlugin (complex messaging)
└── ServicePlugin (full services with storage, jobs, AI)
```

Choose the simplest type that meets your needs.
